const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

function padTime(time: number, pad: number): string {
	return time.toString().padStart(pad, '0')
}

export function FramesToTimestamp(frames: number, timeBaseStr: string) {
	// const timeBase = timeBaseStr && timeBaseStr.match(/1\/\d+/) ? 1 / Number(timeBaseStr.split('/')[1]) : 0
	let targetTime = FramesToMs(frames, timeBaseStr)
	const hours = Math.floor(targetTime / HOUR)
	targetTime -= hours * HOUR

	const minutes = Math.floor(targetTime / MINUTE)
	targetTime -= minutes * MINUTE

	const seconds = Math.floor(targetTime / SECOND)
	targetTime -= seconds * SECOND

	return `${padTime(hours, 2)}:${padTime(minutes, 2)}:${padTime(seconds, 2)}.${padTime(targetTime, 3)}`
}

export function FramesToMs(frames: number, _timeBaseStr: string) {
	const timeBase = 1 / 25 // For now
	let targetTime = frames * timeBase * 1000

	return Math.floor(targetTime)
}
