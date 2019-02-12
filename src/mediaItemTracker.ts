import { EventEmitter } from 'events'
import * as PouchDB from 'pouchdb-node'
import * as PouchDBFind from 'pouchdb-find'
import * as _ from 'underscore'
import * as fs from 'fs-extra'
import { Time, Duration } from './api'

export interface TrackedMediaItem {
	_id: string

	expectedMediaItemId?: string[]

	sourceStorageId?: string
	targetStorageIds: string[]

	name: string
	lastSeen: Time
	lingerTime: Duration
}

export interface TrackedMediaItemDB extends TrackedMediaItem {
	_rev: string
}

export class TrackedMediaItems extends EventEmitter {
	private _db: PouchDB.Database<TrackedMediaItem>

	constructor (dbAdapter?: string, dbPrefix?: string) {
		super()

		PouchDB.plugin(PouchDBFind)

		fs.ensureDirSync(dbPrefix || './db')
		const PrefixedPouchDB = PouchDB.defaults({
			prefix: dbPrefix || './db/'
		} as any)

		this._db = new PrefixedPouchDB('trackedMediaItems', {
			adapter: dbAdapter
		})
		this._db.compact()
		.then(() => this._db.createIndex({
			index: {
				fields: ['sourceStorageId']
			}
		})).then(() => this._db.createIndex({
			index: {
				fields: ['mediaFlowId']
			}
		}))
		.then(() => {
			// Index created
		})
		.catch((e) => this.emit('error', 'trackedMediaItems: Index "sourceStorageId" could not be created.', e))
	}

	/**
	 * Find an item of a given ID (will return undefined if not found), transform it using the delta function and store it in the DB
	 */
	async upsert (id: string, delta: (tmi: TrackedMediaItemDB | undefined) => TrackedMediaItem): Promise<string> {
		let original: TrackedMediaItemDB | undefined = undefined
		try {
			original = await this._db.get(id)
		} catch (e0) {
			const e = e0 as PouchDB.Core.Error
			if (e.status !== 404) {
				throw e
			}
		}

		const modified = delta(original) as TrackedMediaItemDB
		if (original) {
			modified._id = original._id
			modified._rev = original._rev
		}
		return this.tryAndPut(id, modified, delta)
	}

	async put (tmi: TrackedMediaItem): Promise<string> {
		return this._db.put(tmi).then(value => value.id)
	}

	async getById (_id: string): Promise<TrackedMediaItemDB> {
		return this._db.get(_id).then((value) => {
			return value as TrackedMediaItemDB
		})
	}

	async getAllFromStorage (storageId: string, query?: PouchDB.Find.Selector) {
		return this._db.find({selector: _.extend({
			sourceStorageId: storageId
		}, query || {})}).then((value) => {
			return value.docs as TrackedMediaItemDB[]
		})
	}

	async remove (tmi: TrackedMediaItemDB): Promise<boolean> {
		return this._db.remove(tmi._id, tmi._rev).then((value) => value.ok)
	}

	async bulkChange (tmis: TrackedMediaItem[]): Promise<void> {
		return this._db.bulkDocs(tmis).then(({}) => { })
	}

	/**
	 * Used internally by the upsert function, will fail if if error != 409, will re-upsert if 409 (revision mismatch)
	 */
	private async tryAndPut (id: string, doc: TrackedMediaItemDB, delta: (tmi: TrackedMediaItemDB | undefined) => TrackedMediaItem): Promise<string> {
		try {
			await this._db.put(doc)
			return id
		} catch (e0) {
			const e = e0 as PouchDB.Core.Error
			if (e.status !== 409) {
				throw e0
			}
			return (new Promise(resolve => setTimeout(resolve, 100 * Math.random()))).then(() => this.upsert(id, delta))
		}
	}

}
