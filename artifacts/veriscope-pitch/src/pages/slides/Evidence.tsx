export default function Evidence() {
  return (
    <div className="pitch w-screen h-screen overflow-hidden relative">
      <h2 className="max-w-[81vw]">Sadəcə AI cavabı yox — yoxlana bilən sübut</h2>
      <p className="mint mt-[4vh]">Risk → dəqiq sitat → orijinal sənəddə vurğulama</p>
      <div className="grid grid-cols-[1fr_1.15fr] gap-[6.4vw] mt-[5vh] items-center">
        <div>
          <p className="!text-[9vw] font-extrabold !leading-none mint">0–100</p>
          <p className="mt-[2vh]">Uyğunluq balı: 0–100</p>
          <div className="flex h-[1.2vh] mt-[3vh] gap-[.4vw]" aria-label="Daxili uyğunluq balı şkalası">
            <div className="w-1/4 bg-[#71869f]" /><div className="w-1/4 bg-[#476e83]" /><div className="w-1/4 bg-primary" /><div className="w-1/4 bg-accent" />
          </div>
        </div>
        <div>
          <p className="!text-[2.4vw]">Prioritetlər və filtrli risk reyestri</p>
          <div className="rule my-[4vh]" />
          <p className="!text-[2.4vw]">Düzəliş üçün bənd layihəsi və PDF hesabat</p>
        </div>
      </div>
      <p className="note mt-[5vh]">Uyğunluq balı daxili risk göstəricisidir; hüquqi sertifikat deyil.</p>
    </div>
  );
}
