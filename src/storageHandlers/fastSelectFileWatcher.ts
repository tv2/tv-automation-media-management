import { EventEmitter } from 'events'
import watch, { Watcher, EventType } from 'node-watch'
import * as path from 'path'
import * as fs from 'fs-extra'

// interval for restarting watchers that failed to start, most likely due to path not existing at that time
const WATCHER_RESTART_INTERVAL = 10 * 1000
// amount of time for a file size to remain constant before emitting 'update' event
const STABILITY_THRESHOLD = 2 * 1000

export class FastSelectFileWatcher extends EventEmitter {
	private _basePath: string
	private _watchedFiles: Set<string> = new Set()
	private _watchers: Map<string, { watcher: Watcher | null; fileCount: number }> = new Map()
	private _watcherRestartInterval: NodeJS.Timeout
	private _stabilityChecks: Map<string, StabilityCheck> = new Map()

	constructor(basePath: string) {
		super()
		this._basePath = basePath
		this._watcherRestartInterval = setInterval(this.restartWatchers, WATCHER_RESTART_INTERVAL)
	}

	private onEvent = (type: EventType, absoluteFilePath: string) => {
		this.tryRestartingWatcher(absoluteFilePath)
		const relativeFilePath = path.relative(this._basePath, absoluteFilePath)
		if (!this._watchedFiles.has(relativeFilePath)) return
		switch (type) {
			case 'update':
				this.onChange(relativeFilePath)
				break
			case 'remove':
				this.onRemove(relativeFilePath)
				break
		}
	}

	private onChange = (filePath: string) => {
		const stabilityCheck = this._stabilityChecks.get(filePath)
		if (stabilityCheck) this.clearStabilityCheck(stabilityCheck)
		this._stabilityChecks.set(filePath, {
			timeout: setTimeout(() => this.checkFileSize(filePath), STABILITY_THRESHOLD),
			size: fs.stat(path.join(this._basePath, filePath))
		})
	}

	private onRemove = (filePath: string) => {
		this.emit('unlink', filePath)
		const stabilityCheck = this._stabilityChecks.get(filePath)
		if (stabilityCheck) this.clearStabilityCheck(stabilityCheck)
		this._stabilityChecks.delete(filePath)
	}

	private clearStabilityCheck = stabilityCheck => {
		clearTimeout(stabilityCheck.timeout)
		stabilityCheck.size.then(() => {}).catch(err => this.emit('error', err))
	}

	private checkFileSize(filePath: string) {
		const stabilityCheck = this._stabilityChecks.get(filePath)
		if (!stabilityCheck) return
		const sizePromise = stabilityCheck.size
		sizePromise
			.then(async stats => {
				const prevSize = stats.size
				const statPromise = fs.stat(path.join(this._basePath, filePath))
				const stat = await statPromise

				const stabilityCheck = this._stabilityChecks.get(filePath)
				if (sizePromise !== stabilityCheck?.size) {
					// we received a newer event, this check can be discarded
					return
				}
				if (stat.size === prevSize) {
					this.emit('change', filePath)
					this._stabilityChecks.delete(filePath)
				} else {
					stabilityCheck.timeout = setTimeout(() => this.checkFileSize(filePath), STABILITY_THRESHOLD)
					stabilityCheck.size = statPromise
				}
			})
			.catch(err => this.emit('error', err))
	}

	private tryRestartingWatcher(absoluteDirPath: string) {
		const existingWatcher = this._watchers.get(absoluteDirPath)
		if (existingWatcher && !existingWatcher.watcher) {
			existingWatcher.watcher = this.makeWatcher(absoluteDirPath)
			this._watchedFiles.forEach(async fileName => {
				if (absoluteDirPath === path.join(this._basePath, path.dirname(fileName))) {
					const absoluteFilePath = path.join(this._basePath, fileName)
					if (await this.fileExists(absoluteFilePath)) this.onChange(fileName)
				}
			})
		}
	}

	private onWatcherError = (absoluteDirName: string) => {
		const watcher = this._watchers.get(absoluteDirName)
		if (!watcher) return
		watcher.watcher = null
	}

	private makeWatcher = (absoluteDirName: string) => {
		return watch(absoluteDirName, {}, this.onEvent).on('error', () => this.onWatcherError(absoluteDirName))
	}

	private restartWatchers = () => {
		this._watchers.forEach((watcher, absoluteDirName) => {
			if (!watcher.watcher) {
				watcher.watcher = this.makeWatcher(absoluteDirName)
			}
		})
	}

	private getAbsoluteDirName(fileName: string) {
		const dirName = path.dirname(fileName)
		return path.join(this._basePath, dirName)
	}

	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath, fs.constants.F_OK)
			return true
		} catch (err) {
			return false
		}
	}

	add(fileName: string) {
		if (this._watchedFiles.has(fileName)) return
		this._watchedFiles.add(fileName)
		const absoluteDirName = this.getAbsoluteDirName(fileName)
		const existingWatcher = this._watchers.get(absoluteDirName)
		if (existingWatcher) {
			++existingWatcher.fileCount
			return
		}
		const watcher = this.makeWatcher(absoluteDirName)
		this._watchers.set(absoluteDirName, { watcher, fileCount: 1 })
	}

	unwatch(fileName: string) {
		if (!this._watchedFiles.has(fileName)) return
		this._watchedFiles.delete(fileName)
		const absoluteDirName = this.getAbsoluteDirName(fileName)
		const existingWatcher = this._watchers.get(absoluteDirName)
		if (existingWatcher) {
			if (--existingWatcher.fileCount <= 0) {
				existingWatcher.watcher?.close()
				this._watchers.delete(absoluteDirName)
			}
		}
	}

	close() {
		this._watchers.forEach(watcher => {
			watcher.watcher?.close()
		})
		this._stabilityChecks.forEach(stabilityCheck => {
			if (stabilityCheck.timeout) {
				clearTimeout(stabilityCheck.timeout)
			}
		})
		clearInterval(this._watcherRestartInterval)
		return Promise.resolve()
	}
}

interface StabilityCheck {
	timeout: NodeJS.Timeout
	size: Promise<fs.Stats>
}
