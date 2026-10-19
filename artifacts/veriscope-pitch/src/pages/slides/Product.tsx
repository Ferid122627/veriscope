export default function Product() {
  return (
    <div className="pitch w-screen h-screen overflow-hidden relative">
      <h2>Müqaviləni qərara çeviririk</h2>
      <p className="muted mt-[3vh]">Hüquqşünaslar • bizneslər • satınalma komandaları</p>
      <div className="flex items-center justify-between gap-[1.6vw] mt-[9vh]">
        <div className="stage w-[25vw] h-[28vh]">
          <svg className="icon mb-[2vh]" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M16 6h23l11 12v40H16zM39 6v14h11M25 32h16M25 42h16" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /></svg>
          <h3>Sənədi yüklə</h3>
        </div>
        <span className="arrow">→</span>
        <div className="stage filled w-[25vw] h-[28vh]">
          <svg className="w-[5vw] h-[5vw] mb-[2vh]" viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="27" cy="27" r="18" stroke="currentColor" strokeWidth="3" /><path d="m41 41 15 15M27 17v13m0 7v1" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
          <h3>AI riskləri tapsın</h3>
        </div>
        <span className="arrow">→</span>
        <div className="stage w-[25vw] h-[28vh]">
          <svg className="icon mb-[2vh]" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="m32 5 22 9v19c0 13-22 25-22 25S10 46 10 33V14zM20 30l9 9 16-18" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /></svg>
          <h3>Mənbədə yoxla</h3>
        </div>
      </div>
      <div className="rule mt-[7vh]" />
      <p className="mt-[4vh]">Maliyyə • hüquqi • əməliyyat • məlumat təhlükəsizliyi</p>
      <p className="caption mt-[3vh]">PDF, DOCX və mətn dəstəyi</p>
    </div>
  );
}
