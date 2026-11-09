// Online aidat tahsilatı. PayTR iFrame API (https://dev.paytr.com) yapılandırıldıysa o kullanılır; aksi halde
// demo için "test ödeme" sayfası açılır (gerçek para hareketi yoktur, KAHYA_DEMO kapalıyken devre dışıdır).
//
// PayTR imzası (resmî modüllerle aynı):
//   paytr_token = base64(HMAC-SHA256(merchant_key, merchant_id + user_ip + merchant_oid + email + payment_amount
//                 + user_basket + no_installment + max_installment + currency + test_mode + merchant_salt))
//   bildirim    = base64(HMAC-SHA256(merchant_key, merchant_oid + merchant_salt + status + total_amount))
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Config } from '../config.ts'

export type CheckoutInput = {
  oid: string
  /** kuruş */
  amount: number
  email: string
  name: string
  phone: string
  address: string
  userIp: string
  description: string
  okUrl: string
  failUrl: string
}
export type Checkout = { mode: 'iframe' | 'redirect'; url: string }

export interface PaymentProvider {
  readonly name: string
  readonly live: boolean
  checkout(input: CheckoutInput): Promise<Checkout>
}

class MockPaymentProvider implements PaymentProvider {
  readonly name = 'test'
  readonly live = false
  async checkout(input: CheckoutInput): Promise<Checkout> {
    return { mode: 'redirect', url: `/odeme/test/${input.oid}` }
  }
}

export class PayTRProvider implements PaymentProvider {
  readonly name = 'paytr'
  readonly live = true
  private cfg: Required<Pick<Config['paytr'], 'merchantId' | 'merchantKey' | 'merchantSalt'>> & { testMode: boolean }
  private fetchImpl: typeof fetch
  constructor(cfg: Config['paytr'], fetchImpl: typeof fetch = fetch) {
    this.cfg = {
      merchantId: cfg.merchantId!,
      merchantKey: cfg.merchantKey!,
      merchantSalt: cfg.merchantSalt!,
      testMode: cfg.testMode,
    }
    this.fetchImpl = fetchImpl
  }

  tokenFields(input: CheckoutInput) {
    const basket = Buffer.from(
      JSON.stringify([[input.description, (input.amount / 100).toFixed(2), 1]]),
      'utf8',
    ).toString('base64')
    const f = {
      merchant_id: this.cfg.merchantId,
      user_ip: input.userIp,
      merchant_oid: input.oid,
      email: input.email,
      payment_amount: String(input.amount),
      user_basket: basket,
      no_installment: '1',
      max_installment: '0',
      currency: 'TL',
      test_mode: this.cfg.testMode ? '1' : '0',
    }
    const hashStr =
      f.merchant_id +
      f.user_ip +
      f.merchant_oid +
      f.email +
      f.payment_amount +
      f.user_basket +
      f.no_installment +
      f.max_installment +
      f.currency +
      f.test_mode
    const paytr_token = createHmac('sha256', this.cfg.merchantKey)
      .update(hashStr + this.cfg.merchantSalt)
      .digest('base64')
    return { ...f, paytr_token }
  }

  async checkout(input: CheckoutInput): Promise<Checkout> {
    const fields = this.tokenFields(input)
    const form = new URLSearchParams({
      ...fields,
      debug_on: this.cfg.testMode ? '1' : '0',
      timeout_limit: '30',
      merchant_ok_url: input.okUrl,
      merchant_fail_url: input.failUrl,
      user_name: input.name.slice(0, 60),
      user_address: (input.address || 'Türkiye').slice(0, 400),
      user_phone: input.phone.slice(0, 20),
      lang: 'tr',
    })
    const res = await this.fetchImpl('https://www.paytr.com/odeme/api/get-token', { method: 'POST', body: form })
    const data = (await res.json().catch(() => ({}))) as { status?: string; token?: string; reason?: string }
    if (data.status !== 'success' || !data.token)
      throw new Error(`PayTR ödeme başlatılamadı: ${data.reason ?? res.status}`)
    return { mode: 'iframe', url: `https://www.paytr.com/odeme/guvenli/${data.token}` }
  }

  verifyCallback(f: Record<string, string>): boolean {
    if (!f.hash || !f.merchant_oid || !f.status || f.total_amount === undefined) return false
    const expected = createHmac('sha256', this.cfg.merchantKey)
      .update(f.merchant_oid + this.cfg.merchantSalt + f.status + f.total_amount)
      .digest('base64')
    return expected.length === f.hash.length && timingSafeEqual(Buffer.from(expected), Buffer.from(f.hash))
  }
}

export class Payments {
  readonly provider: PaymentProvider
  readonly paytr: PayTRProvider | null
  readonly mockEnabled: boolean
  constructor(config: Config, fetchImpl: typeof fetch = fetch) {
    const p = config.paytr
    this.paytr = p.merchantId && p.merchantKey && p.merchantSalt ? new PayTRProvider(p, fetchImpl) : null
    this.mockEnabled = !this.paytr && config.demo
    this.provider = this.paytr ?? new MockPaymentProvider()
  }
  get enabled() {
    return Boolean(this.paytr) || this.mockEnabled
  }
}
