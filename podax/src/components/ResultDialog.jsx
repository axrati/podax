import { useEffect, useRef } from 'react';

export default function ResultDialog({ location, operation, onClose }) {
  const dialogRef = useRef(null);
  const closeButton = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    }
    closeButton.current?.focus();

    return () => {
      if (dialog.open && typeof dialog.close === 'function') {
        dialog.close();
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="result-dialog"
      aria-labelledby="result-title"
      aria-describedby="result-guidance"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="success-mark" aria-hidden="true">
        ✓
      </div>
      <h2 id="result-title">{operation} complete</h2>
      <p>Your output is located at:</p>
      <output className="result-location">{location}</output>
      <p id="result-guidance" className="result-guidance">
        Verify that the output opens correctly before deleting or changing any original files.
      </p>
      <button ref={closeButton} className="primary-button" type="button" onClick={onClose}>
        Done
      </button>
    </dialog>
  );
}
