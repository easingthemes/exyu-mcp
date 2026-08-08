import 'dotenv/config';
import { createChatProvider, type ChatProvider } from '../src/providers/chat.js';

export async function draftCueReassembly(rawCues: string[], chat: ChatProvider): Promise<string> {
  return chat.complete(rawCues.join('\n'), {
    system:
      'You reassemble subtitle cues into complete sentences by merging fragments split ' +
      'across timed cues. Return only the reassembled text, no commentary.'
  });
}

export async function draftMeaning(canonicalText: string, workTitle: string, chat: ChatProvider): Promise<string> {
  return chat.complete(`Line: "${canonicalText}"\nFilm: ${workTitle}`, {
    system:
      'Draft a short, factual explanation of what this line means and why it matters ' +
      'culturally. This draft will be reviewed and corrected by a human before use — ' +
      'do not present it as verified fact.'
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const chat = createChatProvider();
  const [, , mode, ...rest] = process.argv;
  if (mode === 'cues') {
    const draft = await draftCueReassembly(rest, chat);
    console.log(draft);
  } else if (mode === 'meaning') {
    const [canonicalText, workTitle] = rest;
    const draft = await draftMeaning(canonicalText, workTitle, chat);
    console.log(draft);
  } else {
    console.error('usage: tsx scripts/assist-slice.ts cues <cue1> <cue2> ...');
    console.error('   or: tsx scripts/assist-slice.ts meaning "<canonical text>" "<work title>"');
    process.exit(1);
  }
}
