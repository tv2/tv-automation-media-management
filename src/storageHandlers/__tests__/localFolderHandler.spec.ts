import * as fs from 'fs-extra'
import { LocalFolderHandler } from '../../storageHandlers/localFolderHandler'
import { StorageEventType, StorageEvent } from '../../storageHandlers/storageHandler'
import { StorageType } from '../../api'
import * as path from 'path'
import * as winston from 'winston'
import { FileShareWatcherType } from '../../configManifest'
import { wait } from '../../lib/lib'

describe('LocalFolderHandler', () => {
	let lfh0: LocalFolderHandler

	// set up the test folder
	beforeAll(async done => {
		fs.ensureDirSync('./test')
		fs.writeFileSync('./test/test0.txt', '1234')

		lfh0 = new LocalFolderHandler(
			{
				id: 'local0',
				support: {
					read: true,
					write: true
				},
				type: StorageType.LOCAL_FOLDER,
				options: {
					basePath: './test'
				}
			},
			new winston.Logger({ transports: [new winston.transports.Console()] })
		)
		try {
			await lfh0.init()
			lfh0.on('error', err => fail(err))
			done()
		} catch (e) {
			fail()
		}
	})

	it('returns a list of files in a folder', async done => {
		expect.assertions(2)
		lfh0.getAllFiles().then(
			files => {
				expect(files.length).toBe(1)
				expect(files[0].name).toBe('test0.txt')
				done()
			},
			reason => fail(reason)
		)
	}, 1000)
	it('returns a file handle to a file using a path', async done => {
		try {
			const file = await lfh0.getFile('test0.txt')
			if (file.url === path.normalize('./test/test0.txt')) {
				done()
				return
			}
			fail('File URL is wrong: ' + file.url)
		} catch (e) {
			fail('File could not be found')
		}
	}, 1000)
	it("fails if a file name doesn't exist", async done => {
		try {
			const file = await lfh0.getFile('test-that-doesnt-exist.txt')
			if (file.url === path.normalize('./test/test-that-doesnt-exist.txt')) {
				fail('File URL is set to an unexisting file')
				return
			}
			fail('An object was returned for URL: ' + file.url)
		} catch (e) {
			done()
		}
	}, 1000)
	it('can remove a file', async done => {
		try {
			fs.writeFileSync('./test/test1.txt', '1234')
			const file = await lfh0.getFile('test1.txt')
			await lfh0.deleteFile(file)
			if (fs.existsSync('./test/test1.txt')) {
				fail('File should be deleted')
			}
			done()
		} catch (e) {
			fail(e)
		}
	})
	it('can copy files across handlers', async done => {
		try {
			fs.ensureDirSync('./test2')
			fs.writeFileSync('./test2/test-copy.txt', '1234')

			const lfh1 = new LocalFolderHandler(
				{
					id: 'local1',
					support: {
						read: true,
						write: true
					},
					type: StorageType.LOCAL_FOLDER,
					options: {
						basePath: './test2'
					}
				},
				new winston.Logger({ transports: [new winston.transports.Console()] })
			)
			await lfh1.init()
			const file = await lfh1.getFile('test-copy.txt')
			await (lfh0.putFile(file) as Promise<any>)

			if (fs.existsSync('./test/test-copy.txt')) {
				done()
			} else {
				fail('File should have been copied')
			}
			await lfh1.destroy()
		} catch (e) {
			fail(e)
		} finally {
			fs.removeSync('./test2')
		}
	})
	it('provides file properties for specified files', async done => {
		try {
			expect.assertions(1)
			fs.writeFileSync('./test/test0.txt', '1234')
			const file = await lfh0.getFile('test0.txt')
			const props = await lfh0.getFileProperties(file)
			expect(props.size).toBe(4)
			done()
		} catch (e) {
			fail(e)
		}
	})

	// clean up the test folder
	afterAll(async () => {
		try {
			await lfh0.destroy()
			await fs.remove('./test')
		} catch (e) {
			fail()
		}
	})
})

describe('LocalFolderHandler (chokidar)', () => {
	let lfh0: LocalFolderHandler

	// set up the test folder
	beforeAll(async done => {
		fs.ensureDirSync('./test')
		fs.writeFileSync('./test/test0.txt', '1234')

		lfh0 = new LocalFolderHandler(
			{
				id: 'local0',
				support: {
					read: true,
					write: true
				},
				type: StorageType.LOCAL_FOLDER,
				options: {
					basePath: './test',
					watcher: FileShareWatcherType.CHOKIDAR
				}
			},
			new winston.Logger({ transports: [new winston.transports.Console()] })
		)
		try {
			await lfh0.init()
			lfh0.on('error', err => fail(err))
			done()
		} catch (e) {
			fail()
		}
	})

	it('emits an event when a file is created', async done => {
		expect.assertions(1)

		lfh0.on(StorageEventType.add, (file: StorageEvent) => {
			expect(file.path).toBe('test1.txt')
			done()
		})
		fs.writeFileSync('./test/test1.txt', '1234')
	}, 10000)
	it('emits an event when a file is deleted', async done => {
		expect.assertions(1)

		lfh0.on(StorageEventType.delete, (file: StorageEvent) => {
			expect(file.path).toBe('test1.txt')
			done()
		})
		fs.unlinkSync('./test/test1.txt')
	}, 10000)

	// clean up the test folder
	afterAll(async () => {
		try {
			await lfh0.destroy()
			await fs.remove('./test')
		} catch (e) {
			fail()
		}
	})
})

describe('LocalFolderHandler (node-watch)', () => {
	let lfh0: LocalFolderHandler

	// set up the test folder
	beforeAll(async done => {
		fs.ensureDirSync('./test')
		fs.writeFileSync('./test/test0.txt', '1234')

		lfh0 = new LocalFolderHandler(
			{
				id: 'local0',
				support: {
					read: true,
					write: true
				},
				type: StorageType.LOCAL_FOLDER,
				options: {
					basePath: './test',
					watcher: FileShareWatcherType.NODE_WATCH
				}
			},
			new winston.Logger({ transports: [new winston.transports.Console()] })
		)
		try {
			await lfh0.init()
			lfh0.on('error', err => fail(err))
			done()
		} catch (e) {
			fail()
		}
	})

	afterEach(() => {
		lfh0.removeAllListeners()
	})

	it('emits an event when a file is created', async done => {
		expect.assertions(1)

		lfh0.addMonitoredFile('test1.txt')

		// this is a hack really, but we can't await starting an individual watcher right now
		// and it seems the first time it's started, it takes slightly longer
		await wait(500)

		lfh0.on(StorageEventType.change, (file: StorageEvent) => {
			expect(file.path).toBe('test1.txt')
			done()
		})
		fs.writeFileSync('./test/test1.txt', '1234')
	}, 10000)
	it('emits an event when a file is updated', async done => {
		expect.assertions(1)

		fs.writeFileSync('./test/test2.txt', '1234')
		lfh0.addMonitoredFile('test2.txt')
		lfh0.on(StorageEventType.change, (file: StorageEvent) => {
			expect(file.path).toBe('test2.txt')
			done()
		})
		fs.appendFileSync('./test/test2.txt', '5678')
	}, 10000)
	it('emits an event when a file is deleted', async done => {
		expect.assertions(1)

		lfh0.on(StorageEventType.delete, (file: StorageEvent) => {
			expect(file.path).toBe('test1.txt')
			done()
		})
		fs.unlinkSync('./test/test1.txt')
	}, 10000)
	it('emits an event when a file is created within a new directory', async done => {
		expect.assertions(1)

		lfh0.addMonitoredFile('dir/test4.txt')
		lfh0.on(StorageEventType.change, (file: StorageEvent) => {
			expect(file.path).toBe('dir/test4.txt')
			done()
		})
		fs.ensureDirSync('./test/dir')
		fs.writeFileSync('./test/dir/test4.txt', '1234')
	}, 10000)
	it('emits an event only when files stop growing', async done => {
		expect.assertions(2)

		lfh0.addMonitoredFile('test5.txt')
		const start = Date.now()
		lfh0.on(StorageEventType.change, (file: StorageEvent) => {
			expect(file.path).toBe('test5.txt')
			const end = Date.now()
			expect(end - start).toBeGreaterThan(2000)
			done()
		})
		var writeStream = fs.createWriteStream('./test/test5.txt', { flags: 'a' })
		writeStream.write('1234')
		await wait(1000)
		writeStream.write('5678')
		await wait(1000)
		writeStream.end('9ABC')
	}, 10000)

	// clean up the test folder
	afterAll(async () => {
		try {
			await lfh0.destroy()
			await fs.remove('./test')
		} catch (e) {
			fail()
		}
	})
})
