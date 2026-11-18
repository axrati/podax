import { Link } from 'react-router-dom';

export default function BackButton({ disabled = false }) {
  if (disabled) {
    return (
      <span className="back-link back-link-disabled" aria-disabled="true">
        <span aria-hidden="true">←</span> Home
      </span>
    );
  }

  return (
    <Link className="back-link" to="/" aria-label="Back to the Podax home screen">
      <span aria-hidden="true">←</span> Home
    </Link>
  );
}
