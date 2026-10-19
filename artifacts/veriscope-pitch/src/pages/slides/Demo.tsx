import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList } from "recharts";

export default function Demo() {
  return (
    <div className="pitch w-screen h-screen overflow-hidden relative">
      <h2>Demo: 90 gündən 30 günə</h2>
      <div className="grid grid-cols-[.85fr_1.15fr] gap-[6.4vw] mt-[6vh]">
        <div className="bg-accent text-bg rounded-[1.2vw] px-[3.2vw] py-[4vh]">
          <p className="!text-[10vw] font-extrabold !leading-none">67%</p>
          <p className="mt-[2vh] font-semibold">Ödəniş müddətində 67% azalma</p>
        </div>
        <div className="h-[36vh]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[{name:"Əvvəl",days:90},{name:"Sonra",days:30}]} margin={{top:36,right:20,left:0,bottom:0}} barSize={100}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:"#f1f5f9",fontSize:"2vw",fontFamily:"Geist"}} />
              <YAxis type="number" domain={[0,100]} hide />
              <Bar dataKey="days" isAnimationActive={false} radius={[8,8,0,0]}>
                <Cell fill="#71869f" /><Cell fill="#5ad6c0" />
                <LabelList dataKey="days" position="top" fill="#f1f5f9" fontSize="2vw" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="mt-[5vh]">Əvvəl: 90 gün → imzalanmış əlavə → sonra: 30 gün</p>
      <p className="mint mt-[3vh]">Yeni sübutla təkrar AI yoxlaması</p>
      <p className="note mt-[3vh]">Demo ssenarisidir; dəqiqlik və ya müştəri nəticəsi statistikası deyil.</p>
    </div>
  );
}
