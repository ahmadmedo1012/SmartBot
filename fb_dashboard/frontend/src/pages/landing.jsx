import { PublicHeader } from "@/components/PublicHeader"
import { PublicFooter } from "@/components/PublicFooter"
import { GlowPool } from "@/components/GlowPool"
import { SectionContainer } from "@/components/SectionContainer"
import { SectionHeader } from "@/components/SectionHeader"
import { OrangeButton } from "@/components/OrangeButton"

const iconPath = {bot: "M3 11h18v10H3z M12 16m1 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0 M8 11V7a4 4 0 0 1 8 0v4", sparkles: "M9 3v2M6 5h2M7 18v2M4 20h2M18 9l-.5-1.5M16 7l.5-1.5M19 13l.5-1.5M6 20l3-9 3 9", chart: "M3 3v18h18 M7 16l4-8 4 4 4-6", send: "M22 2L11 13M22 2l-7 20-4-9-9-4", users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7m4 0a4 4 0 1 0-8 0 4 4 0 0 0 8 0 M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75", star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z", chevron: "m6 9 6 6 6-6", arrow: "M5 12h14 M12 5l7 7-7 7", eye: "M1 12s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z M12 12m3 0a3 3 0 1 0-6 0 3 3 0 0 0 6 0"}

function Svg({d, size=24, stroke="var(--orange)", style}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={style}>
    {d.split(/ M/).map((seg, i) => <path key={i} d={i === 0 ? seg : "M"+seg} />)}
  </svg>
}

const features = [
  { d: iconPath.bot, title: "ردود تلقائية", desc: "ردود آنية ومخصصة لجميع تعليقات ورسائل صفحاتك بتقنية الذكاء الاصطناعي" },
  { d: iconPath.sparkles, title: "ذكاء اصطناعي", desc: "تحليل النصوص وفهم السياق للرد بذكاء على استفسارات عملائك" },
  { d: iconPath.chart, title: "تحليلات", desc: "تقارير مفصلة عن أداء الصفحات والمنشورات ونسب التفاعل والنمو" },
  { d: iconPath.send, title: "بث جماعي", desc: "إرسال رسائل جماعية لعملائك عبر البوت بطريقة ذكية ومنظمة" },
  { d: iconPath.users, title: "CRM", desc: "إدارة علاقات العملاء وتتبع التفاعلات وسجل المحادثات" },
  { d: iconPath.users, title: "فريق", desc: "إضافة أعضاء فريقك بصلاحيات مختلفة لإدارة الصفحات معاً" },
]

const faqs = [
  { q: "هل أحتاج صلاحيات خاصة لربط الصفحة؟", a: "تحتاج صلاحية إدارة الصفحة فقط. نطلب أقل الصلاحيات اللازمة للعمل." },
  { q: "هل بياناتي آمنة؟", a: "جميع البيانات مشفرة. لا نشارك معلومات صفحاتك مع أي جهة خارجية." },
  { q: "كم صفحة يمكنني ربطها؟", a: "يمكنك ربط صفحة واحدة في الخطة المجانية، وحتى 10 صفحات في الخطة الاحترافية." },
  { q: "هل تدعم اللغة العربية كاملاً؟", a: "نعم، الواجهة كاملة بالعربية مع دعم كامل للردود والتعليقات العربية." },
  { q: "ماذا يحدث إذا تجاوزت حد الردود الشهري؟", a: "في الخطة المجانية، يقتصر الرد على 100 رد شهرياً. للردود غير المحدودة، اختر الخطة الأساسية أو الاحترافية." },
]

export function Landing() {
  return (
    <div style={{display:"flex",flexDirection:"column",minHeight:"100vh",overflowX:"hidden"}}>
      <PublicHeader />

      {/* Hero */}
      <section style={{position:"relative",minHeight:"100vh",display:"flex",alignItems:"center",overflow:"hidden"}}>
        <GlowPool position="top-0 left-1/2" size="70vmin" color="orange" />
        <div style={{position:"absolute",inset:0,zIndex:0,opacity:.5,backgroundImage:"radial-gradient(circle, color-mix(in oklch, var(--fg) 6%, transparent) .75px, transparent .75px)",backgroundSize:"20px 20px"}} />
        <div style={{position:"relative",zIndex:10,width:"100%",paddingTop:128,paddingBottom:96}}>
          <div style={{maxWidth:1220,margin:"0 auto",padding:"0 24px"}}>
            <div style={{maxWidth:720}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:6,borderRadius:9999,border:"1px solid color-mix(in oklch, var(--orange) 20%, transparent)",background:"color-mix(in oklch, var(--orange) 5%, transparent)",padding:"4px 16px",fontSize:"0.65rem",fontWeight:500,color:"var(--orange)",marginBottom:24}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:"var(--orange)",display:"inline-block"}} /> أكثر من ٥٠٠ صفحة تثق فينا
              </div>
              <h1 style={{fontSize:"clamp(2rem,6vw,3.5rem)",fontWeight:800,lineHeight:1.05,letterSpacing:"-.02em",margin:"0 0 16px"}}>
                <span style={{color:"var(--orange)"}}>SmartBot</span><br />البوت الذكي لفيسبوك
              </h1>
              <p style={{fontSize:"1.125rem",lineHeight:1.7,maxWidth:560,color:"var(--muted-foreground)",margin:"0 0 32px"}}>
                أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك. المنصة الأولى في ليبيا
              </p>
              <div style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:32}}>
                <a href="/register" style={{textDecoration:"none"}}><OrangeButton>ابدأ مجاناً <Svg d={iconPath.arrow} stroke="currentColor" /></OrangeButton></a>
                <a href="/login" style={{display:"inline-flex",alignItems:"center",gap:8,borderRadius:"var(--radius-sm)",fontSize:"0.8125rem",fontWeight:500,height:"2.5rem",padding:"0 1rem",textDecoration:"none",background:"transparent",color:"var(--fg)",border:"1px solid var(--border)",cursor:"pointer"}}>تسجيل الدخول</a>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:16}}>
                <div style={{display:"flex",direction:"ltr"}}>
                  {["أ","س","م","ن"].map((l,i) => (
                    <div key={i} style={{width:36,height:36,borderRadius:"50%",border:"2px solid var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".75rem",fontWeight:700,marginLeft:i<3?-8:0,background:"linear-gradient(135deg,var(--orange),color-mix(in oklch,var(--orange) 80%,transparent))",color:"var(--orange-foreground)"}}>{l}</div>
                  ))}
                </div>
                <div>
                  <div style={{display:"flex",gap:2}}>{[1,2,3,4,5].map(s=><Svg key={s} d={iconPath.star} size={14} stroke="var(--muted)" />)}</div>
                  <span style={{fontSize:".75rem",color:"var(--muted-foreground)"}}>موثوق من آلاف المداراء</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{padding:"64px 0",background:"var(--surface)"}}>
        <div style={{maxWidth:1220,margin:"0 auto",padding:"0 24px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:32}}>
            {[{v:"500+",l:"صفحة نشطة"},{v:"50k+",l:"رد تلقائي"},{v:"98%",l:"معدل رضا"},{v:"24/7",l:"دعم فني"}].map((s,i)=>(
              <div key={i} style={{textAlign:"center"}}>
                <div style={{fontSize:"2.5rem",fontWeight:800,color:"var(--orange)",fontVariantNumeric:"tabular-nums",lineHeight:1.1}}>{s.v}</div>
                <div style={{fontSize:".875rem",marginTop:8,color:"var(--muted-foreground)"}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <SectionContainer>
        <SectionHeader eyebrow="إليك ما يمكنك تحقيقه معنا" title="ميزات متكاملة لإدارة صفحاتك" subtitle="كل ما تحتاجه لإدارة صفحات فيسبوك بكفاءة واحترافية" />
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16}}>
          {features.map((f,i)=>(
            <div key={i} style={{background:"var(--surface)",border:i===0?"1px solid color-mix(in oklch, var(--orange) 30%, transparent)":"1px solid var(--border)",borderRadius:"var(--radius-sm)",padding:24}}>
              <div style={{width:44,height:44,borderRadius:"var(--radius-sm)",display:"flex",alignItems:"center",justifyContent:"center",background:"color-mix(in oklch, var(--orange) 12%, transparent)",marginBottom:16}}><Svg d={f.d} /></div>
              <h3 style={{fontSize:"1rem",fontWeight:600,margin:"0 0 8px"}}>{f.title}</h3>
              <p style={{fontSize:".8125rem",color:"var(--muted-foreground)",lineHeight:1.6,margin:0}}>{f.desc}</p>
            </div>
          ))}
        </div>
      </SectionContainer>

      {/* How it works */}
      <section style={{position:"relative",padding:"96px 0",background:"var(--surface)"}}>
        <div style={{position:"relative",zIndex:10,maxWidth:1220,margin:"0 auto",padding:"0 24px"}}>
          <SectionHeader title="كيف يعمل SmartBot" subtitle="ثلاث خطوات فقط لبدء أتمتة ردودك" />
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:32}}>
            {[{num:"١",title:"اربط صفحتك",desc:"اربط صفحة فيسبوك بخطوات بسيطة وآمنة مع دليل تفاعلي خطوة بخطوة"},{num:"٢",title:"هيئ قواعد الرد",desc:"حدد الكلمات المفتاحية والردود التلقائية التي تناسب نشاطك التجاري"},{num:"٣",title:"راقب الأداء",desc:"تابع الإحصائيات والتقارير وحسّن أداء صفحاتك من لوحة تحكم متكاملة"}].map((s,i)=>(
              <div key={i} style={{textAlign:"center"}}>
                <div style={{width:80,height:80,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 24px",fontSize:"1.5rem",fontWeight:700,color:"var(--orange)",background:"linear-gradient(135deg,color-mix(in oklch, var(--orange) 15%, transparent), transparent)"}}><span>{s.num}</span></div>
                <div style={{background:"var(--bg)",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",padding:24}}>
                  <h3 style={{fontSize:"1.125rem",fontWeight:700,margin:"0 0 12px"}}>{s.title}</h3>
                  <p style={{fontSize:".8125rem",color:"var(--muted-foreground)",lineHeight:1.6,margin:0}}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <SectionContainer>
        <SectionHeader eyebrow="اختر خطتك" title="خطط تناسب جميع الاحتياجات" subtitle="ابدأ مجاناً وارتقِ بحجم عملك" />
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16}}>
          {[{name:"مجاني",price:"0",pages:"صفحة واحدة",replies:"100 رد/شهر"},{name:"أساسي",price:"29",pages:"3 صفحات",replies:"غير محدود"},{name:"احترافي",price:"59",pages:"10 صفحات",replies:"غير محدود"},{name:"مؤسسات",price:"99",pages:"غير محدود",replies:"غير محدود"}].map((p,i)=>(
            <div key={i} style={{background:"var(--surface)",border:i===0?"1px solid color-mix(in oklch, var(--orange) 30%, transparent)":"1px solid var(--border)",borderRadius:"var(--radius-sm)",padding:24,textAlign:"center",...(i===2?{borderColor:"var(--orange)",position:"relative"}:{})}}>
              {i===2&&<div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",fontSize:"0.65rem",fontWeight:700,padding:"4px 12px",borderRadius:9999,background:"var(--orange)",color:"var(--orange-foreground)",whiteSpace:"nowrap"}}>الأكثر طلباً</div>}
              <h3 style={{fontSize:"1rem",fontWeight:600,margin:"0 0 4px"}}>{p.name}</h3>
              <div style={{fontSize:"1.75rem",fontWeight:800,color:"var(--orange)",margin:"8px 0"}}>{p.price==="0"?"مجاني":`${p.price} $`}</div>
              <div style={{fontSize:".8125rem",color:"var(--muted)",margin:"4px 0"}}>{p.pages}</div>
              <div style={{fontSize:".8125rem",color:"var(--muted)",margin:"4px 0 16px"}}>{p.replies}</div>
            </div>
          ))}
        </div>
        <div style={{textAlign:"center",marginTop:24}}><a href="/pricing" style={{color:"var(--orange)",fontSize:".875rem",textDecoration:"none"}}>عرض كل التفاصيل ←</a></div>
      </SectionContainer>

      {/* FAQ */}
      <section style={{position:"relative",padding:"96px 0",background:"var(--surface)"}}>
        <div style={{position:"relative",zIndex:10,maxWidth:640,margin:"0 auto",padding:"0 24px"}}>
          <SectionHeader title="أسئلة شائعة" subtitle="إجابات سريعة لأكثر الأسئلة تردداً" />
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {faqs.map((f,i)=>(
              <details key={i} style={{borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--bg)",overflow:"hidden"}}>
                <summary style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",listStyle:"none",padding:"14px 20px",fontSize:".875rem",fontWeight:500}}>
                  {f.q} <Svg d={iconPath.chevron} size={12} stroke="var(--muted)" />
                </summary>
                <p style={{margin:0,padding:"0 20px 14px",fontSize:".8125rem",color:"var(--muted-foreground)",lineHeight:1.6}}>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <SectionContainer>
        <div style={{textAlign:"center",position:"relative"}}>
          <GlowPool position="top-0 left-0" size="20rem" color="orange" />
          <div style={{position:"relative",zIndex:10}}>
            <SectionHeader title="جهّز صفحتك للانطلاق الرقمي" subtitle={<>انطلق الآن — انضم إلى <strong>أكثر من ٥٠٠ صفحة</strong> تثق في SmartBot</>} />
            <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
              <a href="/register" style={{textDecoration:"none"}}><OrangeButton>ابدأ مجاناً <Svg d={iconPath.arrow} stroke="currentColor" /></OrangeButton></a>
              <a href="/pricing" style={{display:"inline-flex",alignItems:"center",gap:8,borderRadius:"var(--radius-sm)",fontSize:"0.8125rem",fontWeight:500,height:"2.5rem",padding:"0 1rem",textDecoration:"none",background:"transparent",color:"var(--fg)",border:"1px solid var(--border)",cursor:"pointer"}}>عرض الخطط</a>
            </div>
            <p style={{fontSize:".75rem",color:"var(--muted-foreground)",marginTop:24,opacity:.6}}>مجاناً بدون بطاقة ائتمان · إلغاء في أي وقت · دعم فني متكامل</p>
          </div>
        </div>
      </SectionContainer>

      <PublicFooter />
    </div>
  )
}
