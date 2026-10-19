export default function Cover() {
  return (
    <div className="pitch w-screen h-screen overflow-hidden relative">
      <div className="flex items-center gap-[2vw] mt-[3vh]">
        <svg viewBox="0 0 64 64" fill="none" className="w-[8vw] h-[8vw]" aria-label="Veriscope loqosu">
          <circle cx="27" cy="27" r="19" stroke="#f1f5f9" strokeWidth="5" />
          <path d="m18 27 7 7 12-14" stroke="#5ad6c0" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m42 42 14 14" stroke="#f1f5f9" strokeWidth="6" strokeLinecap="round" />
        </svg>
        <h1 className="text-[8vw] font-extrabold tracking-[-.04em] leading-none">VERISCOPE</h1>
      </div>
      <div className="grid grid-cols-[1.05fr_1fr] gap-[6.4vw] mt-[8vh] items-center">
        <div>
          <p className="!text-[3.3vw] font-semibold !leading-[1.2]">Sənəddəki riski gör. Sübutla qərar ver.</p>
          <p className="muted mt-[3vh]">Hüquqşünaslar və bizneslər üçün AI sənəd təhlili</p>
        </div>
        <div className="relative h-[30vh]" aria-label="Sənəd → risk → təsdiq">
          <div className="absolute top-0 left-0 w-[11vw] h-[22vh] rounded-[.8vw] border-[.15vw] border-[#71869f] bg-[#1c304a] p-[1.6vw]">
            <div className="h-[.4vh] w-[5vw] bg-[#b2c1d4] mt-[1vh]" />
            <div className="h-[.4vh] w-[6vw] bg-[#71869f] mt-[2vh]" />
            <div className="h-[.4vh] w-[5vw] bg-[#71869f] mt-[2vh]" />
            <p className="caption mt-[3vh]">Sənəd</p>
          </div>
          <span className="arrow absolute left-[12vw] top-[6vh]">→</span>
          <div className="absolute left-[17vw] top-[4vh] w-[9vw] h-[18vh] bg-primary rounded-[.8vw] flex flex-col items-center justify-center">
            <span className="text-[5vw] font-extrabold leading-none">!</span>
            <p className="!text-[1.5vw] mt-[1vh]">Risk</p>
          </div>
          <span className="arrow absolute left-[27vw] top-[6vh]">→</span>
          <div className="absolute left-[32vw] top-[7vh] w-[7vw] h-[7vw] bg-accent rounded-full grid place-items-center text-bg">
            <svg viewBox="0 0 64 64" className="w-[4vw] h-[4vw]" fill="none" aria-label="Təsdiq"><path d="m12 33 13 13 28-29" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        </div>
      </div>
      <p className="caption absolute bottom-[8vh] left-[6vw]">Veriscope komandası</p>
    </div>
  );
}
