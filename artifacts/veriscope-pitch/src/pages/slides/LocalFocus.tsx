export default function LocalFocus() {
  return (
    <div className="pitch w-screen h-screen overflow-hidden relative">
      <h2>Azərbaycan bazarı üçün yerli fokus</h2>
      <div className="grid grid-cols-[1.2fr_1fr] gap-[6.4vw] mt-[6vh]">
        <div className="bg-primary rounded-[1.2vw] px-[3.2vw] py-[4vh] h-[45vh]">
          <p className="!text-[2.5vw] font-semibold">Azərbaycan qanunvericiliyi üzrə yoxlanmalı sahələr</p>
          <div className="h-[.1vh] bg-[#7ad5d8]/40 mt-[3vh]" />
          <p className="mt-[3vh]">Mülki Məcəllə • Əmək Məcəlləsi • fərdi məlumatlar</p>
        </div>
        <div className="flex flex-col justify-center">
          <svg className="icon mb-[3vh]" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M12 10h40v46H12zM22 22h20M22 32h20M22 42h9" stroke="currentColor" strokeWidth="3" /><path d="m40 43 5 5 11-13" stroke="currentColor" strokeWidth="3" /></svg>
          <p className="!text-[2.6vw] font-semibold">Şirkətin öz qaydaları ilə müqayisə</p>
        </div>
      </div>
      <p className="mt-[4vh] mint">Fərqimiz: yerli kontekst + mənbədən yoxlanan sitat + insan təsdiqi</p>
      <p className="note mt-[3vh]">Hüquqi rəy deyil; yekun qiymətləndirmə mütəxəssisindir.</p>
    </div>
  );
}
