import { Link } from 'react-router-dom';
import decryptLogo from './imgs/decrypted.png';
import encryptLogo from './imgs/encrypted.png';
import helpLogo from './imgs/help.png';
import podaxLogo from './imgs/podax_logo.png';

const choices = [
  {
    to: '/encrypt',
    icon: encryptLogo,
    title: 'Encrypt',
    description: 'Protect a file or an entire folder',
  },
  {
    to: '/decrypt',
    icon: decryptLogo,
    title: 'Decrypt',
    description: 'Recover data from a Podax archive',
  },
  {
    to: '/about',
    icon: helpLogo,
    title: 'About',
    description: 'Security details and practical guidance',
  },
];

export default function Home() {
  return (
    <main className="page home-page">
      <header className="home-header">
        <img className="podax-logo" src={podaxLogo} alt="Podax" />
        <h1>Private encryption, entirely on your computer.</h1>
        <p>No account, cloud upload, analytics, or network connection is required.</p>
      </header>

      <nav className="choice-grid" aria-label="Podax actions">
        {choices.map((choice) => (
          <Link
            className="choice-card"
            to={choice.to}
            key={choice.to}
            aria-label={`${choice.title}: ${choice.description}`}
          >
            <img src={choice.icon} alt="" aria-hidden="true" />
            <span>
              <strong>{choice.title}</strong>
              <small>{choice.description}</small>
            </span>
            <span className="choice-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
