/**
 * App.tsx — starter mini-app component.
 *
 * Demonstrates:
 *  - Reading the active user's profile via apna.identity
 *  - Publishing a note via apna.social
 *  - Low-level nostr query via apna.nostr
 *
 * Replace this file with your app's real UI.
 */
import { useState } from 'react';
import { useApna } from './apna-provider';
import type { NostrEvent } from '@apna/sdk';

export default function App() {
  const { apna } = useApna();
  const [profile, setProfile] = useState<Record<string, string> | null>(null);
  const [notes, setNotes] = useState<NostrEvent[]>([]);
  const [noteText, setNoteText] = useState('');
  const [status, setStatus] = useState('');

  async function loadProfile() {
    setStatus('Loading profile…');
    try {
      const me = await apna.identity.me();
      setProfile({ name: me.name ?? '', picture: me.picture ?? '', about: me.about ?? '' });
      setStatus('');
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  }

  async function loadFeed() {
    setStatus('Loading feed…');
    try {
      const me = await apna.identity.me();
      const pubkey = me.pubkey as string;
      const events = await apna.nostr.query({ kinds: [1], authors: [pubkey], limit: 10 });
      setNotes(events);
      setStatus('');
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  }

  async function publishNote() {
    if (!noteText.trim()) return;
    setStatus('Publishing…');
    try {
      await apna.social.publishNote(noteText.trim());
      setNoteText('');
      setStatus('Note published!');
      setTimeout(() => setStatus(''), 2000);
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: '#368564' }}>
        My Apna Mini-App
      </h1>

      {status && (
        <p style={{ marginBottom: 12, color: '#666', fontSize: 14 }}>{status}</p>
      )}

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Identity</h2>
        <button
          onClick={loadProfile}
          style={btnStyle}
        >
          Load my profile
        </button>
        {profile && (
          <div style={{ marginTop: 8, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            {profile.picture && (
              <img
                src={profile.picture}
                alt="avatar"
                style={{ width: 48, height: 48, borderRadius: '50%', marginBottom: 8 }}
              />
            )}
            <p style={{ fontWeight: 600 }}>{profile.name || '(no name)'}</p>
            {profile.about && <p style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{profile.about}</p>}
          </div>
        )}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Publish a note</h2>
        <textarea
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          placeholder="What's on your mind?"
          rows={3}
          style={{
            width: '100%', padding: 10, borderRadius: 8,
            border: '1px solid #e5e7eb', fontSize: 14, resize: 'vertical',
            marginBottom: 8,
          }}
        />
        <button onClick={publishNote} style={btnStyle} disabled={!noteText.trim()}>
          Publish
        </button>
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>My recent notes</h2>
        <button onClick={loadFeed} style={{ ...btnStyle, background: '#fff', color: '#368564', border: '1px solid #368564' }}>
          Load notes
        </button>
        <ul style={{ marginTop: 12, listStyle: 'none', padding: 0 }}>
          {notes.map(n => (
            <li
              key={n.id}
              style={{
                padding: 12, marginBottom: 8, background: '#fff',
                borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14,
              }}
            >
              {n.content}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#368564',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  cursor: 'pointer',
};
