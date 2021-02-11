import { FramesToTimestamp } from '../timeConversion'

describe('Time conversion', () => {
	it('Converts frame 1 at 25p', () => {
		const result = FramesToTimestamp(1, '1/25')
		expect(result).toBe('00:00:00.000')
	})

	it('Converts frame 25 at 25p', () => {
		const result = FramesToTimestamp(25, '1/25')
		expect(result).toBe('00:00:00.960')
	})

	it('Converts frame 100 at 25p', () => {
		const result = FramesToTimestamp(100, '1/25')
		expect(result).toBe('00:00:03.960')
	})

	it('Converts frame 10000 at 25p', () => {
		const result = FramesToTimestamp(10000, '1/25')
		expect(result).toBe('00:06:39.960')
	})
})
