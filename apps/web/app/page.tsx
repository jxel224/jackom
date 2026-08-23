import Link from 'next/link';
import { buttonClassName } from '../components/ui/button-styles';
import { CreateRoomButton } from '../components/create-room-button';
import { GameCard } from '../components/ui/GameCard';
import { PageContainer } from '../components/ui/PageContainer';
import { SectionTitle } from '../components/ui/SectionTitle';
import { SiteNav } from '../components/nav/SiteNav';
import { ComicArrow, DecorativeSpark, GraphicBurst, HackerFigure, HeroIllustration, NoiseOverlay, PixelGrid, StickerLabel } from '../components/graphics';

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
        <section className="relative overflow-hidden border-b-[3px] border-ink">
          <PixelGrid className="opacity-70" size={26} />
          <NoiseOverlay />
          <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 h-[30rem] w-[30rem] rounded-full bg-brand/10 blur-3xl" />
          <PageContainer className="relative max-w-6xl py-10 sm:py-14">
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-2">
              <div className="relative z-10 flex flex-col items-start gap-5 text-start">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-extrabold tracking-widest text-brand">جاكوم</p>
                  <StickerLabel tone="cyan" className="text-[0.65rem]">
                    اللعبة الأولى متاحة الآن
                  </StickerLabel>
                </div>
                <SectionTitle as="h1" className="max-w-xl">
                  <span className="block text-[3rem] leading-[0.98] sm:text-[4.25rem] lg:text-[5.25rem]">اللعب يبدأ من الشاشة… والفوضى تبدأ من جوالاتكم.</span>
                </SectionTitle>
                <p className="max-w-xl text-lg text-ink-muted">افتح الشاشة، اجمع أصحابك، وابدأ اللعب فورًا — شاشة واحدة مشتركة، وكل صديق يتحكم من جواله.</p>

                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  <CreateRoomButton size="lg" fullWidth={false}>
                    أنشئ غرفة
                  </CreateRoomButton>
                  <Link href="/join" className={buttonClassName({ variant: 'secondary', size: 'lg' })}>
                    انضم إلى غرفة
                  </Link>
                </div>
              </div>

              <div className="relative flex justify-center lg:justify-end">
                <GraphicBurst size={260} accent="action" className="pointer-events-none absolute -right-6 -top-16 hidden opacity-50 lg:block" />
                <HeroIllustration className="relative z-10 w-full max-w-lg lg:-mr-6 lg:scale-110" />
              </div>
            </div>
          </PageContainer>
        </section>

        <section className="relative overflow-hidden border-b border-border bg-surface-1">
          <PixelGrid className="opacity-25" size={30} />
          <PageContainer className="relative flex max-w-6xl flex-col gap-10 py-14">
            <SectionTitle as="h2" subtitle="من فتح الشاشة إلى أول جولة، في أقل من دقيقة.">
              كيف تلعبون؟
            </SectionTitle>

            <ol className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:flex lg:items-start lg:gap-4">
              {STEPS.map((step, index) => {
                const rotate = index % 2 === 0 ? '-rotate-2' : 'rotate-2';
                const lift = index % 2 === 0 ? 'lg:translate-y-0' : 'lg:translate-y-10';
                return (
                  <li key={step.title} className="relative flex flex-1 flex-col gap-3">
                    <div className={['relative overflow-hidden rounded-3xl border-[3px] border-ink bg-surface-0 p-5 shadow-hard', rotate, lift].join(' ')}>
                      <span aria-hidden="true" className="pointer-events-none absolute -right-3 -top-8 font-display text-8xl font-extrabold text-brand opacity-15">
                        {index + 1}
                      </span>
                      <span className="relative font-display text-3xl font-extrabold text-brand">{index + 1}</span>
                      <h3 className="relative mt-1 text-lg font-extrabold text-ink">{step.title}</h3>
                      <p className="relative text-sm text-ink-muted">{step.body}</p>
                    </div>

                    {index < STEPS.length - 1 ? (
                      <>
                        <ComicArrow direction="down" className="pointer-events-none mx-auto py-1 lg:hidden" />
                        <ComicArrow
                          className={['pointer-events-none absolute -left-9 top-1/2 hidden -translate-y-1/2 lg:block', index % 2 === 1 ? 'rotate-180' : ''].join(' ')}
                        />
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </PageContainer>
        </section>

        <PageContainer className="relative flex max-w-6xl flex-col gap-6 py-16">
          <DecorativeSpark size={22} accent="cyan" className="absolute right-6 top-6 hidden sm:block" />
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
            art={<HackerFigure size={116} />}
          />
          <p className="text-sm text-ink-subtle">المزيد من الألعاب قريبًا.</p>
        </PageContainer>

        <section className="relative overflow-hidden border-t-[3px] border-ink bg-surface-1">
          <PixelGrid className="opacity-30" size={30} />
          <GraphicBurst size={200} accent="cyan" className="pointer-events-none absolute -left-16 top-4 hidden opacity-40 lg:block" />
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
