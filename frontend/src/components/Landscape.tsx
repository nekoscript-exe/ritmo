// Ilustración vectorial original para Ritmo, sin imágenes ni fuentes externas.
export function Landscape() {
    return <svg className="landscape" viewBox="0 0 480 270" aria-hidden="true">
    <defs><linearGradient id="sky" x2="0" y2="1"><stop stopColor="#dff3e7"/><stop offset="1" stopColor="#f0f6df"/></linearGradient><linearGradient id="water" x2="1" y2="1"><stop stopColor="#9bdbcc"/><stop offset="1" stopColor="#d3ede0"/></linearGradient></defs>
    <rect width="480" height="270" rx="24" fill="url(#sky)"/><circle cx="336" cy="67" r="31" fill="#f8e8b1"/>
    <path d="M20 166L116 64l90 107 72-78 133 92z" fill="#b7d8c5"/><path d="M69 166l86-73 74 89 109-62 119 78z" fill="#86bca6"/>
    <path d="M0 166q115-40 223 20t257-23v107H0z" fill="#62a98d"/><path d="M202 173q79 18 11 43t89 54h122q-164-24-120-50t-68-48z" fill="url(#water)"/>
    <path d="M0 222q93-29 191 48H0z" fill="#367b62"/><path d="M360 234q39-36 120-25v61H343z" fill="#448b6b"/>
    <g fill="#34785f"><path d="M52 195l23-77 23 77z"/><path d="M86 208l28-96 28 96z"/><path d="M377 190l23-87 23 87z"/><path d="M413 202l27-106 27 106z"/></g>
    <g stroke="#285e4b" strokeWidth="4"><path d="M75 181v37 M114 185v41 M400 173v39 M440 184v35"/></g>
    <g fill="none" stroke="#6e9f89" strokeWidth="2"><path d="M246 57q7-7 14 0 7-7 14 0 M207 77q5-5 10 0 5-5 10 0"/></g>
    <g fill="#e8edbf"><ellipse cx="42" cy="240" rx="9" ry="3"/><ellipse cx="145" cy="246" rx="7" ry="3"/><ellipse cx="395" cy="252" rx="10" ry="3"/></g>
  </svg>;
}
