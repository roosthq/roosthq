import { useState, forwardRef, type InputHTMLAttributes } from 'react';
import LucideIcon from './LucideIcon';

// Plain <input type="password"> plus a show/hide toggle - so a mistyped
// password/PIN can actually be checked before submitting, instead of finding
// out only after a failed login. No `slot` on the icon: this is fixed UI
// chrome, not a re-pickable content icon (see LucideIcon's own doc comment).
const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { wrapperClassName?: string }>(
  function PasswordInput({ className, wrapperClassName, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className={`relative ${wrapperClassName ?? ''}`}>
        <input
          {...rest}
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={`${className ?? ''} pr-9`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-slate-600"
        >
          <LucideIcon name={visible ? 'eye-off' : 'eye'} size={16} />
        </button>
      </div>
    );
  },
);

export default PasswordInput;
