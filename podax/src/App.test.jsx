import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App.jsx';

function installBridge(overrides = {}) {
  const bridge = {
    chooseFile: vi.fn(),
    chooseFolder: vi.fn(),
    chooseEncryptedFile: vi.fn(),
    validatePath: vi.fn().mockResolvedValue({ type: 'file' }),
    encrypt: vi.fn().mockResolvedValue({
      success: true,
      location: '/home/user/Podax/test.podax',
    }),
    decrypt: vi.fn().mockResolvedValue({
      success: true,
      location: '/home/user/Podax/restored.txt',
    }),
    ...overrides,
  };
  Object.defineProperty(window, 'podax', { configurable: true, value: bridge });
  return bridge;
}

async function completeEncryptionForm(user, password = 'correct horse battery staple') {
  await user.type(screen.getByLabelText(/file or folder path/i), '/tmp/report.txt');
  await user.type(screen.getByLabelText(/^password$/i), password);
  await user.type(screen.getByLabelText(/confirm password/i), password);
}

describe('Podax renderer', () => {
  beforeEach(() => {
    window.location.hash = '#/';
    installBridge();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders the primary desktop actions', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /private encryption, entirely on your computer/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /encrypt: protect/i })).toHaveAttribute(
      'href',
      '#/encrypt',
    );
    expect(screen.getByRole('link', { name: /decrypt: recover/i })).toBeInTheDocument();
  });

  test('submits encryption once, clears secrets, and closes its modal with Escape', async () => {
    const bridge = installBridge();
    const user = userEvent.setup();
    window.location.hash = '#/encrypt';
    render(<App />);

    await completeEncryptionForm(user);
    await user.click(screen.getByRole('button', { name: /^encrypt$/i }));

    await waitFor(() => expect(bridge.encrypt).toHaveBeenCalledTimes(1));
    expect(bridge.encrypt).toHaveBeenCalledWith({
      sourcePath: '/tmp/report.txt',
      password: 'correct horse battery staple',
    });
    const dialog = screen.getByRole('dialog', { name: /encryption complete/i });
    expect(screen.getByText('/home/user/Podax/test.podax')).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('');
    expect(screen.getByLabelText(/confirm password/i)).toHaveValue('');

    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(
      await screen.findByRole('heading', { name: /private encryption, entirely on your computer/i }),
    ).toBeInTheDocument();
  });

  test('requires an exact password confirmation', async () => {
    const bridge = installBridge();
    const user = userEvent.setup();
    window.location.hash = '#/encrypt';
    render(<App />);

    await user.type(screen.getByLabelText(/file or folder path/i), '/tmp/report.txt');
    await user.type(screen.getByLabelText(/^password$/i), 'first password value');
    await user.type(screen.getByLabelText(/confirm password/i), 'different password value');
    await user.click(screen.getByRole('button', { name: /^encrypt$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/confirmation does not match/i);
    expect(bridge.encrypt).not.toHaveBeenCalled();
  });

  test('generates and confirms an eight-word password', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/encrypt';
    render(<App />);

    await user.click(screen.getByRole('button', { name: /generate 8 words/i }));
    const generated = screen.getByLabelText(/^password$/i).value;
    expect(generated.split(' ')).toHaveLength(8);
    expect(screen.getByLabelText(/confirm password/i)).toHaveValue(generated);
    expect(screen.getByText(/generated and confirmed/i)).toBeInTheDocument();
  });

  test('prevents duplicate encryption submissions while work is pending', async () => {
    let finishEncryption;
    const bridge = installBridge({
      encrypt: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            finishEncryption = resolve;
          }),
      ),
    });
    const user = userEvent.setup();
    window.location.hash = '#/encrypt';
    render(<App />);
    await completeEncryptionForm(user);

    await user.click(screen.getByRole('button', { name: /^encrypt$/i }));
    await waitFor(() => expect(bridge.encrypt).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /encrypting/i })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /back to the podax home/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /encrypting/i }));
    expect(bridge.encrypt).toHaveBeenCalledTimes(1);

    finishEncryption({ success: true, location: '/home/user/Podax/test.podax' });
    expect(await screen.findByRole('dialog', { name: /encryption complete/i })).toBeInTheDocument();
  });

  test('submits decryption and reports the restored output', async () => {
    const bridge = installBridge();
    const user = userEvent.setup();
    window.location.hash = '#/decrypt';
    render(<App />);

    await user.type(screen.getByLabelText(/encrypted file path/i), '/tmp/archive.podax');
    await user.type(screen.getByLabelText(/^password$/i), 'archive password');
    await user.click(screen.getByRole('button', { name: /^decrypt$/i }));

    await waitFor(() => expect(bridge.decrypt).toHaveBeenCalledTimes(1));
    expect(bridge.decrypt).toHaveBeenCalledWith({
      encryptedPath: '/tmp/archive.podax',
      password: 'archive password',
    });
    expect(screen.getByRole('dialog', { name: /decryption complete/i })).toBeInTheDocument();
    expect(screen.getByText('/home/user/Podax/restored.txt')).toBeInTheDocument();
  });

  test('redirects an unknown hash route to the home screen', async () => {
    window.location.hash = '#/not-a-real-route';
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /private encryption, entirely on your computer/i }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe('#/');
  });
});
