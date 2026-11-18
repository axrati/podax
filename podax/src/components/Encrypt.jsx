import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePathValidation } from '../hooks/usePathValidation.js';
import { podaxApi } from '../lib/podax.js';
import passWords from './assets/pass_words.json';
import encryptLogo from './imgs/encrypted.png';
import BackButton from './BackButton.jsx';
import PasswordField from './PasswordField.jsx';
import ResultDialog from './ResultDialog.jsx';

const ACCEPTED_TYPES = Object.freeze(['file', 'directory']);

function randomIndex(maximum) {
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / maximum) * maximum;
  const randomValue = new Uint32Array(1);
  do {
    window.crypto.getRandomValues(randomValue);
  } while (randomValue[0] >= limit);
  return randomValue[0] % maximum;
}

function generatedPassword() {
  return Array.from({ length: 8 }, () => passWords.words[randomIndex(passWords.words.length)]).join(
    ' ',
  );
}

export default function Encrypt() {
  const navigate = useNavigate();
  const [sourcePath, setSourcePath] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [passwordMessage, setPasswordMessage] = useState(
    'Store this password somewhere safe. Podax never saves it and cannot recover it.',
  );
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const pathStatus = usePathValidation(sourcePath, ACCEPTED_TYPES);
  const pathMessage = useMemo(() => {
    if (pathStatus === 'checking') return 'Checking this path…';
    if (pathStatus === 'file') return 'Ready to encrypt this file.';
    if (pathStatus === 'directory') return 'Ready to encrypt this folder and its contents.';
    if (pathStatus === 'invalid') return 'This path is not an available file or folder.';
    return 'Choose a regular file or folder. Symbolic links are not followed.';
  }, [pathStatus]);

  const chooseSource = async (kind) => {
    setError('');
    try {
      const selected =
        kind === 'file' ? await podaxApi().chooseFile() : await podaxApi().chooseFolder();
      if (selected) {
        setSourcePath(selected);
      }
    } catch (selectionError) {
      setError(selectionError.message);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError('');

    if (!password) {
      setError('Enter or generate a password before encrypting.');
      return;
    }
    if (password.length < 12) {
      setError('Use at least 12 characters for a new archive password.');
      return;
    }
    if (password !== passwordConfirmation) {
      setError('The password confirmation does not match.');
      return;
    }

    setBusy(true);
    try {
      const latestStatus = await podaxApi().validatePath(sourcePath);
      if (!ACCEPTED_TYPES.includes(latestStatus?.type)) {
        setError('Choose an available file or folder before encrypting.');
        return;
      }
      const response = await podaxApi().encrypt({ sourcePath, password });
      if (response?.success) {
        setPassword('');
        setPasswordConfirmation('');
        setResult(response.location);
      } else {
        setError(response?.error || 'Encryption failed before the output was completed.');
      }
    } catch (encryptionError) {
      setError(encryptionError.message || 'Encryption failed before the output was completed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page operation-page">
      <BackButton disabled={busy} />
      <header className="operation-header">
        <img src={encryptLogo} alt="" aria-hidden="true" />
        <div>
          <h1>Encrypt data</h1>
          <p>Create one portable, authenticated Podax archive.</p>
        </div>
      </header>

      <form className="operation-form" onSubmit={submit} noValidate aria-busy={busy}>
        <fieldset disabled={busy}>
          <legend>1. Choose what to protect</legend>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => chooseSource('file')}>
              Choose file
            </button>
            <button className="secondary-button" type="button" onClick={() => chooseSource('folder')}>
              Choose folder
            </button>
          </div>
          <label htmlFor="encrypt-path">File or folder path</label>
          <input
            id="encrypt-path"
            name="sourcePath"
            type="text"
            value={sourcePath}
            onChange={(event) => setSourcePath(event.target.value)}
            aria-describedby="encrypt-path-status"
            aria-invalid={pathStatus === 'invalid'}
            autoComplete="off"
            spellCheck="false"
            required
          />
          <p
            id="encrypt-path-status"
            className={`field-help ${pathStatus === 'invalid' ? 'field-error' : ''}`}
            aria-live="polite"
          >
            {pathMessage}
          </p>
        </fieldset>

        <fieldset disabled={busy}>
          <legend>2. Set a password</legend>
          <div className="field-heading-row">
            <label htmlFor="encrypt-password">Password</label>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                const nextPassword = generatedPassword();
                setPassword(nextPassword);
                setPasswordConfirmation(nextPassword);
                setPasswordMessage('A new 8-word password was generated and confirmed.');
              }}
            >
              Generate 8 words
            </button>
          </div>
          <PasswordField
            id="encrypt-password"
            value={password}
            onChange={setPassword}
            revealed={revealed}
            onToggleReveal={() => setRevealed((value) => !value)}
            autoComplete="new-password"
            minLength={12}
          />
          <label htmlFor="encrypt-password-confirmation">Confirm password</label>
          <PasswordField
            id="encrypt-password-confirmation"
            value={passwordConfirmation}
            onChange={setPasswordConfirmation}
            revealed={revealed}
            onToggleReveal={() => setRevealed((value) => !value)}
            autoComplete="new-password"
            minLength={12}
          />
          <p className="field-help" aria-live="polite">
            {passwordMessage}
          </p>
        </fieldset>

        {error && (
          <p className="form-alert" role="alert">
            {error}
          </p>
        )}

        <button className="primary-button submit-button" type="submit" disabled={busy}>
          {busy ? 'Encrypting…' : 'Encrypt'}
        </button>
        <span className="sr-only" role="status">
          {busy ? 'Encryption in progress. Keep Podax open.' : ''}
        </span>
      </form>

      {result && (
        <ResultDialog
          location={result}
          operation="Encryption"
          onClose={() => navigate('/')}
        />
      )}
    </main>
  );
}
