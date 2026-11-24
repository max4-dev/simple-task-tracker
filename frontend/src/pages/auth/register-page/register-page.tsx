import { BRANDING } from "@/shared/config";
import { Logo } from "@/shared/ui";
import { RegisterForm } from "@/features/auth";
import { Check } from "lucide-react";
import styles from "./register-page.module.css";

export function RegisterPage() {
  return (
    <main className={styles.page}>
      <section className={styles.story} aria-label={BRANDING.NAME}>
        <div className={styles.brand}><Logo size={23} /><span>{BRANDING.NAME}</span></div>
        <div className={styles.visual} aria-hidden="true">
          <div className={styles.orbit} />
          <div className={styles.orbitInner} />
          <div className={styles.connector} />
          <div className={styles.cardBack}><span className={styles.dot} /><div className={styles.line} /><div className={styles.shortLine} /></div>
          <div className={styles.cardFront}><span className={styles.done}><Check size={20} strokeWidth={1.5} /></span><div className={styles.line} /><div className={styles.shortLine} /><div className={styles.cardFooter}><span /><span /><span /></div></div>
          <div className={styles.spark}>+</div>
        </div>
        <div className={styles.statement}>
          <h2>{BRANDING.TAGLINE[0]}<br /><span>{BRANDING.TAGLINE[1]}</span></h2>
          <p>{BRANDING.INTRO[0]}<br />{BRANDING.INTRO[1]}</p>
        </div>
      </section>
      <section className={styles.panel} aria-labelledby="register-title">
        <div className={styles.formContainer}>
          <p className={styles.eyebrow}>НОВОЕ РАБОЧЕЕ ПРОСТРАНСТВО</p>
          <h1 id="register-title">Создайте аккаунт.</h1>
          <p className={styles.subtitle}>Вся работа — в одном месте.</p>
          <RegisterForm />
        </div>
        <p className={styles.footer}>{BRANDING.FOOTER}</p>
      </section>
    </main>
  );
}
