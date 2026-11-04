import { RegisterForm } from '../AuthForms';
import { TelegramLogin } from '../TelegramLogin';

export default function RegisterPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-bold">Регистрация</h1>
      <p className="mb-4 text-sm text-slate-500">5 дней бесплатно со всеми функциями, без оплаты.</p>
      <TelegramLogin />
      <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        или по email
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <RegisterForm />
    </>
  );
}
