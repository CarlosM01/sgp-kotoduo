import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderEn, sesionDe, simularFetch } from './apoyo';

describe('layout: session area (DEF-03, CP-36)', () => {
  it('names the user with text, not with an aria-label on a generic element', async () => {
    sesionDe(['OPERARIO']);
    simularFetch(() => ({ status: 200, body: { siguiente: null, etapas: [] } }));
    const { container } = renderEn('/mi-trabajo');

    await screen.findByRole('heading', { level: 1 });
    const zona = container.querySelector('.usuario');

    expect(zona).not.toBeNull();
    // aria-label is prohibited on a <span> without a role (axe aria-prohibited-attr).
    expect(zona).not.toHaveAttribute('aria-label');
    expect(zona).toHaveTextContent('Persona Prueba');
  });
});
