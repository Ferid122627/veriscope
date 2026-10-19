export default function Close() {
  return (
    <div className="pitch w-screen h-screen overflow-hidden relative">
      <h2 className="!text-[5.3vw] max-w-[86vw]">AI aşkarlayır. İnsan qərar verir.</h2>
      <div className="flex items-center justify-between mt-[7vh] pb-[4vh] border-b border-[#36506a]">
        <p>Yüklə</p><span className="arrow">→</span>
        <p>aşkarlat</p><span className="arrow">→</span>
        <p>düzəlt</p><span className="arrow">→</span>
        <p>yenidən yoxla</p><span className="arrow">→</span>
        <p className="mint font-semibold">təsdiqlə</p>
      </div>
      <div className="grid grid-cols-[1fr_1.15fr] gap-[6.4vw] mt-[6vh] items-center">
        <p className="!text-[2.5vw]">Əvvəl / sonra müqayisəsi və qərar tarixçəsi</p>
        <div className="flex items-center gap-[2.4vw]">
          <svg viewBox="0 0 64 64" className="w-[8vw] h-[8vw] text-accent shrink-0" fill="none" aria-hidden="true"><path d="m32 5 22 9v19c0 13-22 25-22 25S10 46 10 33V14zM20 30l9 9 16-18" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /></svg>
          <p className="!text-[2.5vw] mint">Risk yalnız insan təsdiqi ilə bağlanır</p>
        </div>
      </div>
      <p className="mt-[8vh] !text-[2.4vw] font-semibold">Veriscope — sənəddən sübuta, sübutdan qərara.</p>
    </div>
  );
}
