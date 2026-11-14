import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

if (!Object.getOwnPropertyDescriptor(Element.prototype, 'hasPointerCapture')) {
  Element.prototype.hasPointerCapture = () => false;
}

if (!Object.getOwnPropertyDescriptor(Element.prototype, 'setPointerCapture')) {
  Element.prototype.setPointerCapture = () => undefined;
}

if (!Object.getOwnPropertyDescriptor(Element.prototype, 'releasePointerCapture')) {
  Element.prototype.releasePointerCapture = () => undefined;
}

afterEach(() => {
  cleanup();
});