import Link from 'next/link';
import { buttonClassName } from '../components/ui/button-styles';
import { CreateRoomButton } from '../components/create-room-button';
import { GameCard } from '../components/ui/GameCard';
import { PageContainer } from '../components/ui/PageContainer';
import { SectionTitle } from '../components/ui/SectionTitle';
import { SiteNav } from '../components/nav/SiteNav';
import { ComicArrow, DecorativeSpark, GraphicBurst, HeroIllustration, PixelGrid } from '../components/graphics';

const STEPS = [
  { title: 'افتح اللعبة على الشاشة', body: 'أنشئ غرفة من أي متصفح على التلفاز أو الكمبيوتر.' },
  { title: 'شارك الرمز', body: 'رمز غرفة كبير ورمز QR يظهران مباشرة على الشاشة.' },
  { title: 'ادخلوا من الجوال', body: 'كل لاعب يفتح الرابط ويكتب اسمه — بدون تحميل أي تطبيق.' },
  { title: 'ابدأوا اللعب', body: 'المضيف يبدأ الجولة، والجوالات تتحول إلى أدوات تحكم.' },
];

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main>
        <section className="relative overflow-hidden border-b border-border">
          <PixelGrid className="opacity-60" />
          <PageContainer className="relative flex max-w-6xl flex-col gap-10 py-16 sm:py-24">
            <div className="relative flex flex-col items-start gap-6 text-start">
              <GraphicBurst size={180} accent="action" className="pointer-events-none absolute -right-6 -top-10 hidden opacity-70 sm:block" />
              <p className="relative z-10 text-sm font-extrabold tracking-widest text-brand">جاكوم</p>
              <SectionTitle as="h1" className="relative z-10 max-w-3xl">
                <span className="text-tv-xl leading-[1.05] sm:text-[4.5rem]">اللعب يبدأ من الشاشة… والفوضى تبدأ من جوالاتكم.</span>
              </SectionTitle>
              <p className="relative z-10 max-w-xl text-lg text-ink-muted">افتح الشاشة، اجمع أصحابك، وابدأ اللعب فورًا — شاشة واحدة مشتركة، وكل صديق يتحكم من جواله.</p>

              <div className="relative z-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <CreateRoomButton size="lg" fullWidth={false}>
                  أنشئ غرفة
                </CreateRoomButton>
                <Link href="/join" className={buttonClassName({ variant: 'secondary', size: 'lg' })}>
                  انضم إلى غرفة
                </Link>
              </div>
            </div>

            <div className="relative flex justify-center sm:justify-end">
              <HeroIllustration className="w-full max-w-md" />
            </div>
          </PageContainer>
        </section>

        <PageContainer className="flex max-w-6xl flex-col gap-10 py-16">
          <SectionTitle as="h2" subtitle="من فتح الشاشة إلى أول جولة، في أقل من دقيقة.">
            كيف تلعبون؟
          </SectionTitle>

          <ol className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative flex flex-col gap-3 rounded-3xl border-2 border-border-strong bg-surface-1 p-5">
                <span className="font-display text-3xl font-extrabold text-brand">{index + 1}</span>
                <h3 className="text-lg font-extrabold text-ink">{step.title}</h3>
                <p className="text-sm text-ink-muted">{step.body}</p>
                {index < STEPS.length - 1 ? <ComicArrow className="pointer-events-none absolute -left-8 top-1/2 hidden -translate-y-1/2 lg:block" /> : null}
              </li>
            ))}
          </ol>
        </PageContainer>

        <PageContainer className="flex max-w-6xl flex-col gap-6 py-16">
          <SectionTitle as="h2" subtitle="أول لعبة متاحة الآن على جاكوم">
            العبوا الآن
          </SectionTitle>

          <GameCard
            title="لعبة الهاكر"
            description="لعبة استنتاج اجتماعي — من بينكم هاكر يحاول تخريب المهمة؟ ناقشوا، صوّتوا، واكتشفوا الحقيقة."
            facts={['استنتاج اجتماعي', '٤ إلى ١٢ لاعبًا']}
            statusLabel="متاحة"
            statusTone="brand"
            href="/games"
            ctaLabel="التفاصيل"
            art={<DecorativeSpark size={56} accent="action" />}
          />
          <p className="text-sm text-ink-subtle">المزيد من الألعاب قريبًا.</p>
        </PageContainer>

        <section className="relative overflow-hidden border-t border-border">
          <PageContainer className="relative flex max-w-3xl flex-col items-center gap-6 py-16 text-center">
            <DecorativeSpark size={20} accent="cyan" className="absolute right-8 top-8" />
            <DecorativeSpark size={16} accent="brand" className="absolute left-10 bottom-10" />
            <SectionTitle as="h2" className="items-center">
              جهّزوا الشاشة وابدأوا الفوضى
            </SectionTitle>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <CreateRoomButton>أنشئ غرفة</CreateRoomButton>
              <Link href="/join" className={buttonClassName({ variant: 'secondary', size: 'lg', fullWidth: true })}>
                انضم إلى غرفة
              </Link>
            </div>
          </PageContainer>
        </section>
      </main>
    </>
  );
}
