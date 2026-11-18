import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePathValidation } from '../hooks/usePathValidation.js';
import { podaxApi } from '../lib/podax.js';
import BackButton from './BackButton.jsx';
import PasswordField from './PasswordField.jsx';
import ResultDialog from './ResultDialog.jsx';
import decryptLogo from './imgs/decrypted.png';

const ACCEPTED_TYPES = Object.freeze(['file']);

export default function Decrypt() {
  const navigate = useNavigate();
  const [encryptedPath, setEncryptedPath] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const pathStatus = usePathValidation(encryptedPath, ACCEPTED_TYPES);
  const pathMessage = useMemo(() => {
    if (pathStatus === 'checking') return 'Checking this path…';
    if (pathStatus === 'file') return 'Ready to decrypt this archive.';
    if (pathStatus === 'invalid') return 'This path is not an available file.';
    return 'Choose a .podax file. Archives created by earlier Podax versions are supported.';
  }, [pathStatus]);

  const chooseArchive = async () => {
    setError('');
    try {
      const selected = await podaxApi().chooseEncryptedFile();
      if (selected) {
        setEncryptedPath(selected);
      }
    } catch (selectionError) {
      setError(selectionError.message);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError('');

    setBusy(true);
    try {
      const latestStatus = await podaxApi().validatePath(encryptedPath);
      if (latestStatus?.type !== 'file') {
        setError('Choose an available encrypted file before decrypting.');
        return;
      }
      const response = await podaxApi().decrypt({ encryptedPath, password });
      if (response?.success) {
        setPassword('');
        setResult(response.location);
      } else {
        setError(response?.error || 'Decryption failed. Check the file and password.');
      }
    } catch (decryptionError) {
      setError(decryptionError.message || 'Decryption failed. Check the file and password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page operation-page">
      <BackButton disabled={busy} />
      <header className="operation-header">
        <img src={decryptLogo} alt="" aria-hidden="true" />
        <div>
          <h1>Decrypt data</h1>
          <p>Restore a file or folder from a Podax archive.</p>
        </div>
      </header>

      <form className="operation-form" onSubmit={submit} noValidate aria-busy={busy}>
        <fieldset disabled={busy}>
          <legend>1. Choose an encrypted archive</legend>
          <button className="secondary-button" type="button" onClick={chooseArchive}>
            Choose .podax file
          </button>
          <label htmlFor="decrypt-path">Encrypted file path</label>
          <input
            id="decrypt-path"
            name="encryptedPath"
            type="text"
            value={encryptedPath}
            onChange={(event) => setEncryptedPath(event.target.value)}
            aria-describedby="decrypt-path-status"
            aria-invalid={pathStatus === 'invalid'}
            autoComplete="off"
            spellCheck="false"
            required
          />
          <p
            id="decrypt-path-status"
            className={`field-help ${pathStatus === 'invalid' ? 'field-error' : ''}`}
            aria-live="polite"
          >
            {pathMessage}
          </p>
        </fieldset>

        <fieldset disabled={busy}>
          <legend>2. Enter the archive password</legend>
          <label htmlFor="decrypt-password">Password</label>
          <PasswordField
            id="decrypt-password"
            value={password}
            onChange={setPassword}
            revealed={revealed}
            onToggleReveal={() => setRevealed((value) => !value)}
            autoComplete="current-password"
          />
          <p className="field-help">
            Passwords are used only in memory and are never stored. Leave this blank only for an
            original legacy archive created with a blank password.
          </p>
        </fieldset>

        {error && (
          <p className="form-alert" role="alert">
            {error}
          </p>
        )}

        <button className="primary-button submit-button" type="submit" disabled={busy}>
          {busy ? 'Decrypting…' : 'Decrypt'}
        </button>
        <span className="sr-only" role="status">
          {busy ? 'Decryption in progress. Keep Podax open.' : ''}
        </span>
      </form>

      {result && (
        <ResultDialog
          location={result}
          operation="Decryption"
          onClose={() => navigate('/')}
        />
      )}
    </main>
  );
}
