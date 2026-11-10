import { useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from './Icon';
import { Landscape } from './Landscape';
export function Auth({ onSubmit, busy }: {
    onSubmit: (action: 'login' | 'register', username: string, password: string) => Promise<void>;
    busy: boolean;
}) {
    const [action, setAction] = useState<'login' | 'register'>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    async function submit(event: FormEvent) { event.preventDefault(); await onSubmit(action, username, password); setPassword(''); }
    return <main className="auth-page"><section className="auth-intro"><a className="brand" href="/"><span className="brand-mark"><Icon name="leaf" size={28}/></span>ritmo<span className="brand-dot">.</span></a><div><p className="eyebrow">MENOS PRISA. MÁS PROPÓSITO.</p><h1>Tu espacio,<br />a tu ritmo.</h1><p>Haz lugar para tus planes, tus hábitos<br />y esos pequeños momentos para ti.</p></div><Landscape /></section><section className="auth-form card"><span className="round-icon"><Icon name="leaf" size={26}/></span><h2>{action === 'login' ? 'Qué bueno verte de nuevo' : 'Empieza a encontrar tu ritmo'}</h2><p className="muted">Tu agenda y tus hábitos, en un solo lugar.</p><form onSubmit={submit}><label>Usuario<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} pattern="[a-zA-Z0-9_.\-]{3,32}" minLength={3} maxLength={32} required disabled={busy}/></label><label>Contraseña<input type="password" autoComplete={action === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} minLength={10} maxLength={128} required disabled={busy}/></label><p className="tiny muted">Usuario de 3 a 32 caracteres. Contraseña de 10 a 128 caracteres.</p><button className="primary" disabled={busy}>{busy ? 'Un momento…' : action === 'login' ? 'Entrar a mi espacio' : 'Crear mi cuenta'}<Icon name="arrow" size={16}/></button></form><button className="text-button" disabled={busy} onClick={() => setAction(action === 'login' ? 'register' : 'login')}>{action === 'login' ? '¿Primera vez aquí? Crear cuenta' : 'Ya tengo una cuenta'}</button><a className="tiny muted" href="/legacy.html">Abrir la interfaz anterior</a></section></main>;
}
