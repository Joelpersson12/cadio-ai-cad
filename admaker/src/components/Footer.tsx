export default function Footer() {
  return (
    <footer className="border-t border-white/8 mt-24 py-12 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-start justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg gradient-bg flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white" />
                </svg>
              </div>
              <span className="font-bold text-sm text-white">AdForge AI</span>
            </div>
            <p className="text-white/40 text-xs max-w-xs leading-relaxed">
              AI-powered ad creation for modern brands. Generate copy, compose image ads, and build reels in seconds.
            </p>
            <p className="text-white/25 text-xs mt-4">
              Made by the team behind{' '}
              <a href="https://cadio.app" target="_blank" rel="noreferrer" className="text-brand-400 hover:text-brand-300">
                Cadio AI
              </a>
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 text-xs">
            <div>
              <p className="text-white/60 font-semibold mb-3">Product</p>
              <div className="space-y-2">
                <a href="#features" className="block text-white/35 hover:text-white/70 transition-colors">Features</a>
                <a href="#pricing" className="block text-white/35 hover:text-white/70 transition-colors">Pricing</a>
                <a href="#how-it-works" className="block text-white/35 hover:text-white/70 transition-colors">How it Works</a>
              </div>
            </div>
            <div>
              <p className="text-white/60 font-semibold mb-3">Company</p>
              <div className="space-y-2">
                <a href="https://cadio.app" target="_blank" rel="noreferrer" className="block text-white/35 hover:text-white/70 transition-colors">Cadio AI</a>
                <a href="#" className="block text-white/35 hover:text-white/70 transition-colors">Blog</a>
                <a href="#" className="block text-white/35 hover:text-white/70 transition-colors">Contact</a>
              </div>
            </div>
            <div>
              <p className="text-white/60 font-semibold mb-3">Legal</p>
              <div className="space-y-2">
                <a href="#" className="block text-white/35 hover:text-white/70 transition-colors">Privacy</a>
                <a href="#" className="block text-white/35 hover:text-white/70 transition-colors">Terms</a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-white/20 text-xs">© 2025 AdForge AI. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="#" className="text-white/20 hover:text-white/50 transition-colors">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.03c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 0 1-1.93.07 4.28 4.28 0 0 0 4 2.98 8.521 8.521 0 0 1-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z"/></svg>
            </a>
            <a href="#" className="text-white/20 hover:text-white/50 transition-colors">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
