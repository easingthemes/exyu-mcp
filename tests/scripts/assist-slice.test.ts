import { describe, it, expect, vi } from 'vitest';
import { draftCueReassembly, draftMeaning } from '../../scripts/assist-slice.js';
import type { ChatProvider } from '../../src/providers/chat.js';

describe('draftCueReassembly', () => {
  it('sends the raw cues to the chat provider and returns its draft', async () => {
    const chat: ChatProvider = { complete: vi.fn().mockResolvedValue('Vazduh trepti, kao da nebo gori.') };

    const draft = await draftCueReassembly(['Vazduh trepti,', 'kao da nebo gori.'], chat);

    expect(draft).toBe('Vazduh trepti, kao da nebo gori.');
    expect(chat.complete).toHaveBeenCalledWith(
      expect.stringContaining('Vazduh trepti,'),
      expect.objectContaining({ system: expect.stringContaining('reassemble') })
    );
  });
});

describe('draftMeaning', () => {
  it('asks the chat provider to draft a meaning, explicitly marked as unverified', async () => {
    const chat: ChatProvider = { complete: vi.fn().mockResolvedValue('draft meaning text') };

    const draft = await draftMeaning('Vazduh trepti, kao da nebo gori.', 'Valter brani Sarajevo', chat);

    expect(draft).toBe('draft meaning text');
    expect(chat.complete).toHaveBeenCalledWith(
      expect.stringContaining('Valter brani Sarajevo'),
      expect.objectContaining({ system: expect.stringContaining('human') })
    );
  });
});
