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
  registerFormSchema,
  resolveAuthRedirectFromLocationState,
  toRegisterRequestPayload,
  type RegisterFormValues,
} from '@/features/auth/auth-forms';
import { AuthPageLayout } from '@/features/auth/auth-page-layout';

export function RegisterPage(): React.JSX.Element {
  const { register: registerAccount } = useAuth();
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
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: RegisterFormValues): Promise<void> => {
    setBannerError(null);
    try {
      await registerAccount(toRegisterRequestPayload(values));
      toast({
        title: 'Conta criada com sucesso.',
        description: 'Sua biblioteca pessoal está pronta para uso.',
        variant: 'success',
      });
      await navigate(destination, { replace: true });
    } catch (error: unknown) {
      const { bannerMessage } = applyAuthErrorToForm(
        error,
        setError,
        ['name', 'email', 'password'],
        { mapConflictToField: 'email' },
      );
      setBannerError(bannerMessage);
    }
  };

  return (
    <AuthPageLayout
      eyebrow="CADASTRO"
      title="Criar conta"
      subtitle="Crie sua biblioteca pessoal para organizar referências e compartilhar coleções públicas."
      bannerError={bannerError}
      alternatePrompt="Já possui uma conta?"
      alternateLabel="Entrar"
      alternateTo={ROUTES.LOGIN}
    >
      <form
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        onSubmit={(event) => {
          void handleSubmit(onSubmit)(event);
        }}
      >
        <FormField
          id="register-name"
          label="Nome"
          optionalLabel="Opcional"
          error={errors.name?.message}
        >
          <Input
            type="text"
            autoComplete="name"
            placeholder="Como deseja ser identificado"
            disabled={isSubmitting}
            {...register('name')}
          />
        </FormField>

        <FormField id="register-email" label="E-mail" error={errors.email?.message} required>
          <Input
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            disabled={isSubmitting}
            {...register('email')}
          />
        </FormField>

        <FormField
          id="register-password"
          label="Senha"
          hint="Mínimo de 12 caracteres."
          error={errors.password?.message}
          required
        >
          <PasswordInput
            autoComplete="new-password"
            placeholder="Crie uma senha forte"
            disabled={isSubmitting}
            {...register('password')}
          />
        </FormField>

        <Button
          type="submit"
          variant="primary"
          fullWidth
          isLoading={isSubmitting}
          loadingText="Criando conta..."
        >
          Criar conta
        </Button>
      </form>
    </AuthPageLayout>
  );
}
