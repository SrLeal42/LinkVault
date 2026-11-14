import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExternalLinkIcon, PlusIcon, SpinnerIcon } from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirmdialog';
import { EmptyState } from '@/components/ui/emptystate';
import { FormField, Input, Select, Textarea } from '@/components/ui/formfield';
import { ToastProvider } from '@/components/ui/toast';
import { useToast } from '@/components/ui/toast-context';

describe('Ícones SVG', () => {
  it('marca ícones decorativos com aria-hidden por padrão e expõe role="img" com title', () => {
    const { container } = render(
      <div>
        <ExternalLinkIcon data-testid="decorative-icon" />
        <SpinnerIcon title="Carregando registros" />
      </div>,
    );

    const decorative = screen.getByTestId('decorative-icon');
    expect(decorative).toHaveAttribute('aria-hidden', 'true');

    const accessible = screen.getByRole('img', { name: 'Carregando registros' });
    expect(accessible).not.toHaveAttribute('aria-hidden');
    expect(container.querySelector('[data-lv-spinner="true"]')).toBeInTheDocument();
  });
});

describe('Button', () => {
  it('aplica variantes, tamanho e type="button" por padrão', () => {
    render(
      <Button variant="danger" size="lg">
        Excluir coleção
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Excluir coleção' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('button', 'buttonDanger', 'buttonLg');
  });

  it('bloqueia cliques duplicados e exibe loadingText quando isLoading é true', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Button isLoading loadingText="Salvando link..." onClick={onClick}>
        Salvar
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Salvando link...' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('FormField e Controles', () => {
  it('associa label, hint e erro com aria-invalid e aria-describedby', () => {
    render(
      <FormField
        id="link-url"
        label="URL de destino"
        hint="Aceita endereços http ou https."
        error="URL inválida."
        required
      >
        <Input type="url" placeholder="https://exemplo.dev" />
      </FormField>,
    );

    const input = screen.getByLabelText(/URL de destino/i);
    expect(input).toHaveAttribute('id', 'link-url');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'link-url-hint link-url-error');
    expect(screen.getByRole('alert')).toHaveTextContent('URL inválida.');
  });

  it('suporta Textarea, Select e marcador opcional', () => {
    render(
      <div>
        <FormField id="notes" label="Notas pessoais" optionalLabel="Opcional">
          <Textarea rows={3} />
        </FormField>
        <FormField id="sort" label="Ordenação">
          <Select defaultValue="created_desc">
            <option value="created_desc">Mais recentes</option>
            <option value="title_asc">Título (A–Z)</option>
          </Select>
        </FormField>
      </div>,
    );

    expect(screen.getByText('Opcional')).toBeInTheDocument();
    expect(screen.getByLabelText('Notas pessoais').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Ordenação')).toHaveValue('created_desc');
  });
});

describe('ConfirmDialog', () => {
  it('exibe consequência, delega fechamento ao onConfirm e cancela via onOpenChange', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Revogar compartilhamento?"
        description="A URL pública atual deixará de funcionar imediatamente."
        consequence="Se você tornar esta coleção pública novamente, uma nova URL será gerada."
        confirmLabel="Revogar acesso"
        tone="danger"
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole('alertdialog', { name: 'Revogar compartilhamento?' });
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Se você tornar esta coleção pública novamente, uma nova URL será gerada.',
      ),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Revogar acesso' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('impede fechamento por Escape e desabilita ações quando isLoading é true', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Excluir link?"
        description="Esta ação remove o link permanentemente."
        confirmLabel="Excluir"
        isLoading={true}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeDisabled();

    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('ToastProvider e useToast', () => {
  function ToastTriggerDemo() {
    const { toast } = useToast();
    return (
      <Button
        onClick={() => {
          toast({
            title: 'Link criado com sucesso.',
            description: 'Salvo na sua biblioteca.',
            variant: 'success',
          });
        }}
      >
        Disparar aviso
      </Button>
    );
  }

  function BrokenConsumer() {
    useToast();
    return null;
  }

  it('lança erro quando useToast é usado fora do ToastProvider', () => {
    expect(() => render(<BrokenConsumer />)).toThrow(
      'useToast deve ser utilizado dentro de um ToastProvider.',
    );
  });

  it('exibe e permite fechar notificações no ToastViewport', async () => {
    const user = userEvent.setup();

    render(
      <ToastProvider defaultDurationMs={60_000}>
        <ToastTriggerDemo />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Disparar aviso' }));

    const region = screen.getByRole('region', { name: /Notificações/i });
    expect(within(region).getByText('Link criado com sucesso.')).toBeInTheDocument();
    expect(within(region).getByText('Salvo na sua biblioteca.')).toBeInTheDocument();

    await user.click(within(region).getByRole('button', { name: 'Fechar notificação' }));
    expect(within(region).queryByText('Link criado com sucesso.')).not.toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('renderiza hierarquia editorial, ação e variante compacta', () => {
    function ControlledExample() {
      const [clicked, setClicked] = useState(false);
      return (
        <EmptyState
          eyebrow="BIBLIOTECA"
          title="Sua biblioteca ainda está vazia."
          description="Salve referências técnicas para consultar e organizar com tags."
          icon={<PlusIcon />}
          compact
          action={
            <Button onClick={() => { setClicked(true); }}>
              {clicked ? 'Adicionado' : 'Adicionar link'}
            </Button>
          }
        />
      );
    }

    const { container } = render(<ControlledExample />);

    expect(screen.getByText('BIBLIOTECA')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Sua biblioteca ainda está vazia.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar link' })).toBeInTheDocument();
    expect(container.querySelector('section')).toHaveClass('container', 'compact');
  });
});