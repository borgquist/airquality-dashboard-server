// Shared state accessible across modules

export let config = null;
export let lastAqiData = null;
export let lastUvData = null;

// Function to update the shared config state
export function setConfig(newConfig) {
  config = newConfig;
}

// Functions to update last data states (optional, direct assignment also works for exported let)
export function setLastAqiData(data) {
  lastAqiData = data;
}

export function setLastUvData(data) {
  lastUvData = data;
} 