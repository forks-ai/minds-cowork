// `<ChannelsView>` — connect messaging channels (Telegram/Slack/Discord/
// WhatsApp) to the agent. One card per plugin; capability flags from the
// server decide which fields/buttons render. Secrets are masked on read
// (is_set / value:null) and only sent when the operator types a new value.
//
// Connect flow: save credentials, then `setup` when the channel supports
// webhook registration (Telegram), otherwise `reload` to bring the live
// adapter online — channels without setup must have their webhook URL
// registered on the platform side (we surface the path for that).

import { useEffect, useState } from 'react';
import Ico from '../components/Icons';
import {
  fetchChannelPlugins,
  fetchChannelStatus,
  fetchChannelConfig,
  saveChannelConfig,
  deleteChannelConfig,
  reloadChannel,
  setupChannel,
  teardownChannel,
} from '../api';

function StatusBadge({ active, configured }) {
  const label = active ? 'Active' : configured ? 'Configured' : 'Not connected';
  const tone = active ? 'ok' : configured ? 'warn' : 'idle';
  return <span className={`channels-badge channels-badge-${tone}`}>{label}</span>;
}

function ChannelCard({ plugin, status, onChanged }) {
  const caps = plugin.capabilities || {};
  const [config, setConfig] = useState(null);     // { fields: { name: {is_set, value} } }
  const [draft, setDraft] = useState({});          // user-typed values, by field name
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadConfig() {
    try {
      setConfig(await fetchChannelConfig(plugin.channel_type));
    } catch {
      setConfig({ fields: {} });
    }
  }
  useEffect(() => { loadConfig(); }, [plugin.channel_type]);

  function setField(name, value) {
    setDraft((d) => ({ ...d, [name]: value }));
  }

  async function connect() {
    setBusy(true); setError(''); setNotice('');
    try {
      // Only send fields the operator actually typed — blank secret fields
      // keep their stored value (server merge semantics).
      const values = Object.fromEntries(
        Object.entries(draft).filter(([, v]) => v != null && v !== ''),
      );
      if (Object.keys(values).length) await saveChannelConfig(plugin.channel_type, values);

      if (caps.supports_webhook_setup) {
        const r = await setupChannel(plugin.channel_type);
        setNotice(r?.active ? 'Connected — webhook registered.' : (r?.detail || 'Setup ran.'));
      } else {
        const r = await reloadChannel(plugin.channel_type);
        setNotice(r?.active
          ? 'Credentials saved — adapter active. Register the webhook URL below on the platform.'
          : 'Credentials saved, but the channel is not active yet (missing required fields?).');
      }
      setDraft({});
      await loadConfig();
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'Connect failed');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true); setError(''); setNotice('');
    try {
      if (caps.supports_teardown) {
        try { await teardownChannel(plugin.channel_type); } catch { /* non-fatal */ }
      }
      await deleteChannelConfig(plugin.channel_type);
      setDraft({});
      await loadConfig();
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'Disconnect failed');
    } finally {
      setBusy(false);
    }
  }

  const fields = config?.fields || {};
  const configured = status?.configured;
  const active = status?.status === 'active';
  const webhookPath = (plugin.webhook_paths || [])[0];

  return (
    <section className="channels-card">
      <header className="channels-card-head">
        <div>
          <h2>{plugin.display_name}</h2>
          <code className="channels-type">{plugin.channel_type}</code>
        </div>
        <StatusBadge active={active} configured={configured} />
      </header>

      <div className="channels-fields">
        {(plugin.credentials || []).map((f) => {
          const isSet = fields[f.name]?.is_set;
          const stored = fields[f.name]?.value;  // non-null only for non-secret fields
          return (
            <label key={f.name} className="channels-field">
              <span className="channels-field-label">
                {f.label}{f.required ? <em className="channels-req"> *</em> : null}
                {isSet ? <span className="channels-set">set</span> : null}
              </span>
              <input
                type={f.secret ? 'password' : 'text'}
                className="channels-input"
                value={draft[f.name] ?? (f.secret ? '' : (stored ?? ''))}
                placeholder={f.secret && isSet ? '•••••••• (leave blank to keep)' : (f.description || '')}
                onChange={(e) => setField(f.name, e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          );
        })}
      </div>

      {webhookPath && !caps.supports_webhook_setup ? (
        <p className="channels-hook">
          Register this webhook on {plugin.display_name}:{' '}
          <code>{`<server public URL>/api/v1/channels/${plugin.channel_type}${webhookPath}`}</code>
        </p>
      ) : null}

      {caps.supports_oauth ? (
        <p className="channels-note">OAuth install isn’t wired yet — enter credentials directly above.</p>
      ) : null}

      {error ? <p className="channels-error">{error}</p> : null}
      {notice ? <p className="channels-notice">{notice}</p> : null}

      <div className="channels-actions">
        <button type="button" className="channels-btn channels-btn-primary" onClick={connect} disabled={busy}>
          {Ico.power(15)}<span>{configured ? 'Save & reconnect' : 'Connect'}</span>
        </button>
        {configured ? (
          <button type="button" className="channels-btn channels-btn-ghost" onClick={disconnect} disabled={busy}>
            Disconnect
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default function ChannelsView() {
  const [plugins, setPlugins] = useState([]);
  const [statusByType, setStatusByType] = useState({});
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [pl, st] = await Promise.all([fetchChannelPlugins(), fetchChannelStatus()]);
    setPlugins(pl);
    setStatusByType(Object.fromEntries((st.channels || []).map((c) => [c.channel_type, c])));
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  return (
    <div className="channels-view">
      <header className="channels-top">
        <span>Channels</span>
        <button type="button" className="channels-btn channels-btn-ghost" onClick={refresh} title="Refresh">
          {Ico.refresh(15)}
        </button>
      </header>
      <main className="channels-content">
        <p className="channels-intro">
          Connect a messaging app so people can talk to the agent from their chats.
        </p>
        {loading ? (
          <p className="channels-muted">Loading channels…</p>
        ) : plugins.length === 0 ? (
          <p className="channels-muted">No channels available. Is the server running?</p>
        ) : (
          <div className="channels-grid">
            {plugins.map((p) => (
              <ChannelCard
                key={p.channel_type}
                plugin={p}
                status={statusByType[p.channel_type]}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
