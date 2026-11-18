import BackButton from './BackButton.jsx';

export default function About() {
  return (
    <main className="page about-page">
      <BackButton />
      <header className="section-header">
        <p className="eyebrow">About Podax</p>
        <h1>Encryption without an account or a cloud.</h1>
        <p>
          Podax performs every operation locally. The packaged application blocks web requests and
          does not include analytics, advertising, or a password recovery service.
        </p>
      </header>

      <section className="about-grid" aria-label="Podax security details">
        <article>
          <h2>Authenticated archives</h2>
          <p>
            New archives use AES-256-GCM, a random salt and initialization vector, and a key derived
            with scrypt. Tampering or an incorrect password causes decryption to fail.
          </p>
        </article>
        <article>
          <h2>Portable folders</h2>
          <p>
            Folder entries use platform-independent path metadata, so archives can move between
            Windows, macOS, and Linux. Empty folders and file timestamps are preserved.
          </p>
        </article>
        <article>
          <h2>Legacy compatibility</h2>
          <p>
            Podax can still open archives produced by the original AES-CTR release. Re-encrypt
            important restored data to gain authentication and the current portable format.
          </p>
        </article>
        <article>
          <h2>Safe output</h2>
          <p>
            Completed archives and restored data are placed in a Podax folder inside your home
            directory. Existing files are never silently replaced.
          </p>
        </article>
      </section>

      <aside className="warning-card">
        <h2>Your password cannot be recovered</h2>
        <p>
          Keep a separate, secure copy of every password. Always verify restored data before
          removing an original or backup. Symbolic links and special filesystem entries are
          intentionally rejected.
        </p>
      </aside>
    </main>
  );
}
