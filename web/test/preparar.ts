import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { cerrarSesion, tomarMotivoCierre } from '../src/compartido/sesion';

afterEach(() => {
  cleanup();
  cerrarSesion('salida');
  tomarMotivoCierre();
  sessionStorage.clear();
});

// jsdom has no <dialog> modal API: open/close are enough for the tests.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
}
