import { useEffect, useState } from 'react';
import { podaxApi } from '../lib/podax.js';

export function usePathValidation(sourcePath, acceptedTypes) {
  const [validation, setValidation] = useState({ path: '', status: 'empty' });

  useEffect(() => {
    let active = true;

    if (!sourcePath.trim()) {
      return () => {
        active = false;
      };
    }

    const timeout = window.setTimeout(async () => {
      try {
        const result = await podaxApi().validatePath(sourcePath);
        if (active) {
          setValidation({
            path: sourcePath,
            status: acceptedTypes.includes(result?.type) ? result.type : 'invalid',
          });
        }
      } catch {
        if (active) {
          setValidation({ path: sourcePath, status: 'invalid' });
        }
      }
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [acceptedTypes, sourcePath]);

  if (!sourcePath.trim()) {
    return 'empty';
  }
  return validation.path === sourcePath ? validation.status : 'checking';
}
