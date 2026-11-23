import { describe, expect, it } from 'vitest';
import { MEETING_ZONE_RADIUS, MeetingController } from './MeetingController';

describe('MeetingController (T-06)', () => {
  it('accepts exactly one valid confirmation', () => {
    const m = new MeetingController();
    expect(m.confirm('mp_moon')).toBe(false);
    expect(m.confirm('mp_yard')).toBe(true);
    expect(m.confirm('mp_fountain')).toBe(false); // double press / change of mind ignored
    expect(m.acceptedPointId).toBe('mp_yard');
  });

  it('cannot deliver before a spot is agreed', () => {
    const m = new MeetingController();
    expect(m.canDeliver()).toBe(false);
    m.confirm('mp_fountain');
    expect(m.canDeliver()).toBe(true);
  });

  it('wait exemption only inside the right zone and only before Finn arrives', () => {
    const m = new MeetingController();
    expect(m.isWaitExempt(1)).toBe(false); // nothing agreed yet
    m.confirm('mp_fountain');
    expect(m.isWaitExempt(1)).toBe(true);
    expect(m.isWaitExempt(MEETING_ZONE_RADIUS + 0.1)).toBe(false); // left the area → counts again
    expect(m.isWaitExempt(null)).toBe(false);
    m.markArrived();
    expect(m.isWaitExempt(1)).toBe(false);
  });

  it('arrival is ignored before confirmation', () => {
    const m = new MeetingController();
    m.markArrived();
    expect(m.finnArrived).toBe(false);
  });
});
