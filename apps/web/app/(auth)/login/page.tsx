import { LoginForm } from '../AuthForms';
import { TelegramLogin } from '../TelegramLogin';

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Вход</h1>
      <TelegramLogin />
      <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        или по email
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <LoginForm />
    </>
  );
}
