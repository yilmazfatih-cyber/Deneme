/**
 * Oturum ekranlarının (karşılama, giriş, kayıt, şifre) sade düzeni: ortada tek kart, üstte uygulama adı.
 * Uygulama kabuğu (gezinme) bu ekranlarda yoktur; `<main>` burada açılır.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { APP } from '../../app/config.ts'
import { BrandMark } from '../../app/BrandMark.tsx'

export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:py-14">
      <Link
        to="/"
        className="mb-8 inline-flex min-h-12 items-center gap-2.5 rounded-xl px-2 text-lg font-extrabold tracking-tight"
      >
        <BrandMark />
        {APP.name}
      </Link>
      <main className="w-full max-w-md">
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-[0_1px_0_var(--line),0_24px_48px_-32px_rgb(0_0_0/0.35)] sm:p-8">
          <h1
            tabIndex={-1}
            data-page-title
            className="text-2xl font-extrabold tracking-tight text-balance outline-none"
          >
            {title}
          </h1>
          {description && <p className="mt-2 text-muted">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  )
}
