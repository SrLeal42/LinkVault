import { useState } from 'react';
import type * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { FormField, Input, PasswordInput } from '@/components/ui/formfield';
import { useToast } from '@/components/ui/toast-context';
import { ROUTES, useAuth } from '@/features/auth/auth-context';
import {
  applyAuthErrorToForm,
  loginFormSchema,
  resolveAuthRedirectFromLocationState,
  toLoginRequestPayload,
  type LoginFormValues,
} from '@/features/auth/auth-forms';
import { AuthPageLayout } from '@/features/auth/auth-page-layout';

export function LoginPage(): React.JSX.Element {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [bannerError, setBannerError] = useState<string | null>(null);

  const destination = resolveAuthRedirectFromLocationState(location.state);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues): Promise<void> => {
    setBannerError(null);
    try {
      await login(toLoginRequestPayload(values));
      toast({
        title: 'Sessão iniciada.',
        description: 'Bem-vindo de volta à sua biblioteca.',
        variant: 'success',
      });
      await navigate(destination, { replace: true });
    } catch (error: unknown) {
      const { bannerMessage } = applyAuthErrorToForm(error, setError, ['email', 'password']);
      setBannerError(bannerMessage);
    }
  };

  return (
    <AuthPageLayout
      eyebrow="ACESSO"
      title="Entrar no LinkVault"
      subtitle="Acesse sua biblioteca pessoal de links, coleções e notas privadas."
      bannerError={bannerError}
      alternatePrompt="Ainda não possui uma conta?"
      alternateLabel="Criar conta"
      alternateTo={ROUTES.REGISTER}
    >
      <form
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        onSubmit={(event) => {
          void handleSubmit(onSubmit)(event);
        }}
      >
        <FormField id="login-email" label="E-mail" error={errors.email?.message} required>
          <Input
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            disabled={isSubmitting}
            {...register('email')}
          />
        </FormField>

        <FormField id="login-password" label="Senha" error={errors.password?.message} required>
          <PasswordInput
            autoComplete="current-password"
            placeholder="Sua senha"
            disabled={isSubmitting}
            {...register('password')}
          />
        </FormField>

        <Button
          type="submit"
          variant="primary"
          fullWidth
          isLoading={isSubmitting}
          loadingText="Entrando..."
        >
          Entrar
        </Button>
      </form>
    </AuthPageLayout>
  );
}
