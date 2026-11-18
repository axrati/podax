function unavailableApi() {
  throw new Error('The Podax desktop bridge is unavailable. Restart the application and try again.');
}

export function podaxApi() {
  const api = window.podax;
  if (
    !api ||
    typeof api.validatePath !== 'function' ||
    typeof api.encrypt !== 'function' ||
    typeof api.decrypt !== 'function'
  ) {
    return {
      chooseFile: unavailableApi,
      chooseFolder: unavailableApi,
      chooseEncryptedFile: unavailableApi,
      validatePath: unavailableApi,
      encrypt: unavailableApi,
      decrypt: unavailableApi,
    };
  }
  return api;
}
