import { describe, it, expect } from '@jest/globals';
import { renderIntro } from '../lib/reminderTemplates';
import { __test__ as inboundTest } from '../pages/api/webhooks/twilio/inbound';

const { postProcessMessage } = inboundTest;

describe('SMS messaging helpers', () => {
  describe('renderIntro', () => {
    it('produces a short, warm intro without hard CTA or links', () => {
      const msg = renderIntro('Jordan', 'OutboundRevive');
      expect(msg.length).toBeLessThan(200);
      expect(/pricing|call link/i.test(msg)).toBe(false);
      expect(msg.toLowerCase()).toContain('wanted to reconnect');
      expect(msg.toLowerCase()).toContain('charlie');
      expect(msg).not.toContain('http');
    });
  });

  describe('postProcessMessage', () => {
    it('keeps booking link at the end while preserving main content', () => {
      const booking = 'https://cal.com/outboundrevive/intro';
      const processed = postProcessMessage(
        'Sounds good. Grab a spot here: ' + booking + ' ',
        booking,
        false
      );
      expect(processed.endsWith(booking)).toBe(true);
      const prefix = processed.replace(booking, '').trim();
      expect(prefix.length).toBeGreaterThan(0);
    });

    it('removes booking link when gateHit is true', () => {
      const booking = 'https://cal.com/outboundrevive/intro';
      const processed = postProcessMessage(
        `All set—here's the link again: ${booking}`,
        booking,
        true
      );
      expect(processed.includes(booking)).toBe(false);
      expect(processed.length).toBeLessThan(320);
    });

    it('truncates messages to 320 characters while preserving link', () => {
      const booking = 'https://cal.com/outboundrevive/intro';
      const veryLong = `${'A'.repeat(400)} ${booking}`;
      const processed = postProcessMessage(veryLong, booking, false);
      expect(processed.length).toBeLessThanOrEqual(320);
      expect(processed.endsWith(booking)).toBe(true);
    });

    it('strips filler like "I hope you’re doing well"', () => {
      const processed = postProcessMessage("I hope you're doing well! Just wanted to check in.", '', false);
      expect(processed.toLowerCase()).not.toContain("hope you're doing well");
    });
  });
});

