import { useCallback, useEffect, useState } from 'react';
import { host } from '../platform/host';
import { MINDS_BILLING_URL, MINDS_REGISTER_URL } from './onboarding/constants';
import {
  buildByokValidationRequest,
  decodeEmailFromJwt,
  getDefaultModel,
} from './onboarding/helpers';
import {
  ByokScreen,
  SSOPendingScreen,
  SubscribePendingScreen,
  SubscribeScreen,
  SuccessPanel,
  ValidatingPanel,
  WelcomeScreen,
} from './onboarding/screens';
import type { ByokProvider, FinalizeOutcome, Phase } from './onboarding/types';

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<Phase>('welcome');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const [byokProvider, setByokProvider] = useState<ByokProvider>('anthropic');
  const [selectedModel, setSelectedModel] = useState<string>(getDefaultModel('anthropic'));
  const [customModel, setCustomModel] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');

  const finishSuccess = useCallback(() => {
    setTimeout(onComplete, 800);
  }, [onComplete]);

  const resetAuthState = useCallback(() => {
    setAccessToken(null);
    setUserEmail('');
  }, []);

  const tryFinalize = useCallback(async (): Promise<FinalizeOutcome> => {
    const result = await host.mindshubFinalize();
    if (result.ok) return { kind: 'committed' };
    if (result.upgradeRequired) return { kind: 'upgrade-required' };
    return { kind: 'error', detail: result.reason || 'Could not finalize MindsHub setup.' };
  }, []);

  const handleFinalizeOutcome = useCallback((outcome: FinalizeOutcome) => {
    if (outcome.kind === 'committed') {
      setPhase('success');
      finishSuccess();
      return;
    }

    if (outcome.kind === 'upgrade-required') {
      setPhase('subscribe');
      return;
    }

    resetAuthState();
    setErrorMsg(outcome.detail);
    setPhase('welcome');
  }, [finishSuccess, resetAuthState]);

  const acceptToken = useCallback(async (token: string) => {
    setAccessToken(token);
    setUserEmail(decodeEmailFromJwt(token));
    setErrorMsg('');
    setPhase('validating');
    const outcome = await tryFinalize();
    handleFinalizeOutcome(outcome);
  }, [handleFinalizeOutcome, tryFinalize]);

  useEffect(() => {
    if (!host.isElectron) return;

    let cancelled = false;

    (async () => {
      const { configured } = await host.checkConfigured();
      if (cancelled || !configured) return;

      const cached = await host.mindshubGetCachedToken();
      let token = cached;

      if (!token) {
        const refreshed = await host.mindshubRefresh();
        if (refreshed.ok && refreshed.access_token) token = refreshed.access_token;
      }

      if (!cancelled && token) await acceptToken(token);
    })();

    return () => { cancelled = true; };
  }, [acceptToken]);

  const handleLogin = useCallback(async () => {
    setErrorMsg('');
    setPhase('sso-pending');

    const result = await host.mindshubLogin();
    if (!result.ok) {
      setErrorMsg(result.reason === 'cancelled' ? '' : (result.reason || 'Sign in failed. Please try again.'));
      setPhase('welcome');
      return;
    }

    if (!result.access_token) {
      setErrorMsg('No access token returned by MindsHub. Please try again.');
      setPhase('welcome');
      return;
    }

    await acceptToken(result.access_token);
  }, [acceptToken]);

  const handleCancelLogin = useCallback(async () => {
    await host.oauthCancel();
  }, []);

  const handleCheckout = useCallback(async () => {
    setErrorMsg('');
    await host.openExternal(MINDS_BILLING_URL);
    setPhase('subscribe-pending');
  }, []);

  const handleCheckoutAgain = useCallback(async () => {
    setErrorMsg('');
    await host.openExternal(MINDS_BILLING_URL);
  }, []);

  const handleRefreshSubscription = useCallback(async () => {
    setErrorMsg('');
    setIsChecking(true);

    const refreshed = await host.mindshubRefresh();
    if (refreshed.ok && refreshed.access_token) {
      setAccessToken(refreshed.access_token);
      setUserEmail(decodeEmailFromJwt(refreshed.access_token));
    }

    const outcome = await tryFinalize();
    setIsChecking(false);

    if (outcome.kind === 'committed') {
      setPhase('success');
      finishSuccess();
      return;
    }

    if (outcome.kind === 'upgrade-required') {
      setErrorMsg("We don't see your subscription yet. Wait a few seconds and try again.");
      return;
    }

    setErrorMsg(outcome.detail);
  }, [finishSuccess, tryFinalize]);

  const handleGoToBYOK = useCallback(() => {
    setErrorMsg('');
    setPhase('byok');
  }, []);

  const handleBackToWelcome = useCallback(() => {
    setErrorMsg('');
    setPhase('welcome');
  }, []);

  const handleBackToSubscribe = useCallback(() => {
    setErrorMsg('');
    setPhase('subscribe');
  }, []);

  const handleSkipToApp = useCallback(() => {
    setErrorMsg('');
    onComplete();
  }, [onComplete]);

  const handleChangeProvider = useCallback((provider: ByokProvider) => {
    setByokProvider(provider);
    setSelectedModel(getDefaultModel(provider));
    setCustomModel('');
    setCustomBaseUrl('');
    setLlmApiKey('');
    setErrorMsg('');
  }, []);

  const handleConnectBYOK = useCallback(async () => {
    setErrorMsg('');
    setPhase('validating');

    const request = buildByokValidationRequest(
      byokProvider,
      selectedModel,
      customModel,
      customBaseUrl,
      llmApiKey,
    );

    const validation = await host.validateProvider(
      request.provider,
      request.apiKey,
      request.baseUrl,
      request.model,
    );

    if (!validation.ok) {
      setErrorMsg(validation.error || 'Validation failed');
      setPhase('byok');
      return;
    }

    const providerType =
      byokProvider === 'anthropic' ? 'anthropic'
      : byokProvider === 'openai' ? 'openai'
      : byokProvider === 'gemini' ? 'gemini'
      : 'openai-compatible';

    const provider = {
      type: providerType,
      apiKey: request.apiKey,
      isDefault: true,
      ...(providerType === 'openai-compatible' ? {
        baseUrl: customBaseUrl.trim(),
        name: 'Custom provider',
      } : {}),
    };

    const response = await fetch(`${host.getApiOrigin()}/v1/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: [provider],
        modelMode: 'custom',
        modelOverrides: {
          planning: { providerType, model: request.model },
          coding: { providerType, model: request.model },
        },
        providerStatus: { [providerType]: 'ok' },
        memoryMode: 'autopilot',
        episodicMemory: true,
      }),
    });

    if (!response.ok) {
      let detail = 'Could not save provider settings.';
      try {
        const body = await response.json() as { detail?: string };
        if (body?.detail) detail = body.detail;
      } catch {
        // Keep the fallback message when the backend returns no JSON body.
      }
      setErrorMsg(detail);
      setPhase('byok');
      return;
    }

    await host.serverStop().catch(() => undefined);
    await host.serverStart().catch(() => undefined);
    setPhase('success');
    finishSuccess();
  }, [
    byokProvider,
    customBaseUrl,
    customModel,
    finishSuccess,
    llmApiKey,
    selectedModel,
  ]);

  if (phase === 'welcome') {
    return (
      <WelcomeScreen
        errorMsg={errorMsg}
        onLogin={handleLogin}
        onRegister={() => host.openExternal(MINDS_REGISTER_URL)}
      />
    );
  }

  if (phase === 'sso-pending') {
    return <SSOPendingScreen onCancel={handleCancelLogin} />;
  }

  if (phase === 'subscribe') {
    return (
      <SubscribeScreen
        email={userEmail}
        onCheckout={handleCheckout}
        onUseOwnLLM={handleGoToBYOK}
      />
    );
  }

  if (phase === 'subscribe-pending') {
    return (
      <SubscribePendingScreen
        errorMsg={errorMsg}
        isChecking={isChecking}
        onBack={handleBackToSubscribe}
        onCheckoutAgain={handleCheckoutAgain}
        onRefresh={handleRefreshSubscription}
      />
    );
  }

  if (phase === 'byok') {
    return (
      <ByokScreen
        apiKey={llmApiKey}
        customBaseUrl={customBaseUrl}
        customModel={customModel}
        errorMsg={errorMsg}
        isLoggedIn={Boolean(accessToken)}
        onBack={accessToken ? handleBackToSubscribe : handleBackToWelcome}
        onChangeApiKey={setLlmApiKey}
        onChangeBaseUrl={setCustomBaseUrl}
        onChangeCustomModel={setCustomModel}
        onChangeModel={setSelectedModel}
        onChangeProvider={handleChangeProvider}
        onConnect={handleConnectBYOK}
        onSkip={handleSkipToApp}
        provider={byokProvider}
        selectedModel={selectedModel}
      />
    );
  }

  if (phase === 'validating') {
    return <ValidatingPanel label="Connecting…" />;
  }

  return <SuccessPanel />;
}
