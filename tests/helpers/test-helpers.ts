/**
 * Helper to skip tests when server is not available
 */

export function skipIfServerUnavailable(serverAvailable: boolean, testFn: () => void | Promise<void>) {
  if (!serverAvailable) {
    console.log('Skipping: server not available');
    return;
  }
  return testFn();
}

