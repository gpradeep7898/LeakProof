import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-teal flex items-center justify-center text-white font-bold text-sm">
              LP
            </div>
            <span className="font-semibold text-gray-900">LeakProof</span>
          </Link>
          <Link
            href="/app"
            className="px-4 py-2 bg-teal text-white rounded-lg font-medium hover:bg-teal-700 transition-smooth"
          >
            Try Demo
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 text-center">
        <div className="inline-block px-4 py-1.5 bg-teal/10 text-teal rounded-full text-sm font-medium mb-6">
          Stop Guessing, Start Growing
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 max-w-3xl mx-auto leading-tight mb-6">
          Find <span className="text-teal">Revenue Leaks</span>{' '}
          <span className="text-amber-500">Before They Sink You</span>
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10 pt-[15px] pb-[15px]">
          LeakProof turns your Shopify data into plain-English answers about your biggest revenue opportunities. No spreadsheets. No confusion. Just action.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            href="/app"
            className="px-6 py-3 bg-teal text-white rounded-lg font-medium hover:bg-teal-700 transition-smooth inline-flex items-center gap-2"
          >
            See Your Leaks Now →
          </Link>
          <Link
            href="/app"
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-smooth"
          >
            Watch 2-Min Demo
          </Link>
        </div>
      </section>

      {/* Revenue Leak Card Preview */}
      <section className="px-6 pb-16">
        <div className="max-w-xl mx-auto bg-white rounded-xl shadow-lg border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded bg-amber-500/20 flex items-center justify-center text-amber-600">⚡</div>
            <div>
              <p className="text-sm font-medium text-gray-900">Revenue Leak Detected</p>
              <p className="text-xs text-gray-500">Live Demo</p>
            </div>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Discount Dependency Crisis</h3>
          <p className="text-gray-600 mb-4">Giving away 22% of revenue in discounts.</p>
          <p className="text-2xl font-bold text-red-600">$12,850</p>
          <p className="text-sm text-gray-500">at risk</p>
          <p className="text-teal text-sm mt-4">This is a live demo. Connect your store to see your actual revenue leaks.</p>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Most Shopify Founders Are <span className="text-red-700">Bleeding Money</span>
          </h2>
          <p className="text-lg text-gray-600">
            20% discounts training customers to wait for sales. High-value buyers churning silently. One-time customers never returning. You're too busy to notice.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Why LeakProof</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: '$', iconBg: 'bg-amber-500/20', title: 'Revenue Leak Detection', desc: 'Instantly identify where money is slipping through the cracks' },
              { icon: '⚡', iconBg: 'bg-teal/20', title: 'Founder Mode', desc: 'Get answers in plain English, not spreadsheets' },
              { icon: '👥', iconBg: 'bg-teal/20', title: 'Customer Intelligence', desc: "Know exactly who to target and when" },
              { icon: '📈', iconBg: 'bg-teal/20', title: 'Action-First Insights', desc: 'Every insight comes with a clear next step' },
            ].map((f) => (
              <div key={f.title} className="bg-white rounded-xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-smooth">
                <div className={`w-10 h-10 rounded-lg ${f.iconBg} flex items-center justify-center text-lg mb-4`}>{f.icon}</div>
                <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-600 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h2>
          <p className="text-gray-600 mb-12">Start finding revenue leaks today. No credit card required.</p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: 'Starter', desc: 'For new stores testing the waters', price: '$49/month', cta: 'Start Free Trial', popular: false, features: ['Up to 500 orders/month', 'Revenue leak detection', 'Basic customer segments', 'Email support'] },
              { name: 'Growth', desc: 'For scaling brands', price: '$149/month', cta: 'Start Free Trial', popular: true, features: ['Up to 5,000 orders/month', 'Advanced leak detection', 'Predictive churn alerts', 'Action engine', 'Priority support'] },
              { name: 'Enterprise', desc: 'For high-volume stores', price: 'Custom', cta: 'Contact Sales', popular: false, features: ['Unlimited orders', 'Custom integrations', 'Dedicated success manager', 'API access', 'White-label options'] },
            ].map((p) => (
              <div key={p.name} className={`bg-white rounded-xl p-6 shadow-md border-2 ${p.popular ? 'border-teal' : 'border-gray-100'} relative`}>
                {p.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-teal text-white text-xs font-medium rounded-full">Most Popular</div>
                )}
                <h3 className="font-bold text-gray-900 mb-1">{p.name}</h3>
                <p className="text-sm text-gray-500 mb-4">{p.desc}</p>
                <p className="text-2xl font-bold text-gray-900 mb-4">{p.price}</p>
                <Link
                  href="/app"
                  className={`block w-full py-2.5 rounded-lg font-medium text-center mb-6 ${p.popular ? 'bg-teal text-white' : 'border border-gray-300 text-gray-700'}`}
                >
                  {p.cta}
                </Link>
                <ul className="space-y-2">
                  {p.features.map((x) => (
                    <li key={x} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="text-green-500">✓</span> {x}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-gradient-to-r from-teal to-amber-400">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Stop the Leaks?</h2>
          <p className="text-white/90 mb-8">Join hundreds of Shopify founders who've recovered tens of thousands in lost revenue.</p>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-teal rounded-lg font-medium hover:bg-gray-50 transition-smooth"
          >
            Try LeakProof Free →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-teal flex items-center justify-center text-white font-bold text-sm">LP</div>
          <span className="font-semibold">LeakProof</span>
        </div>
        <p className="max-w-6xl mx-auto mt-2 text-sm text-gray-400">© 2024 LeakProof. All rights reserved.</p>
      </footer>
    </div>
  )
}
