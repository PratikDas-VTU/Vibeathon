/* ============================================
   VIBATHON 2026 - JavaScript Functionality
   ============================================ */

// ============================================
// CYBER BACKGROUND ANIMATION (INTERACTIVE AI SYNAPSE)
// ============================================
class CyberBackground {
    constructor() {
        this.canvas = document.getElementById('cyber-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.connections = [];
        this.orbs = [];
        this.sparks = []; // Luminous stardust particle trail on cursor movement
        this.particleCount = 85;
        this.orbCount = 5;
        this.mouse = { x: null, y: null, smoothX: null, smoothY: null, radius: 190 };
        
        this.init();
    }
    
    init() {
        this.resize();
        this.createParticles();
        this.createOrbs();
        this.animate();
        
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            
            // Emit gentle stardust particles along cursor motion
            if (Math.random() > 0.35) {
                this.createSpark(e.clientX, e.clientY);
            }
        });
        window.addEventListener('mouseleave', () => {
            this.mouse.x = null;
            this.mouse.y = null;
            this.mouse.smoothX = null;
            this.mouse.smoothY = null;
        });
    }
    
    createSpark(x, y) {
        if (this.sparks.length > 35) return;
        const sparkColors = [
            '37, 99, 235',   // Blue 600
            '6, 182, 212',   // Cyan 500
            '99, 102, 241',  // Indigo 500
            '16, 185, 129'   // Emerald 500
        ];
        this.sparks.push({
            x: x + (Math.random() - 0.5) * 6,
            y: y + (Math.random() - 0.5) * 6,
            vx: (Math.random() - 0.5) * 1.5,
            vy: (Math.random() - 0.5) * 1.5 - 0.3,
            radius: Math.random() * 2 + 1,
            color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
            life: 1.0,
            decay: Math.random() * 0.04 + 0.02
        });
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    createParticles() {
        this.particles = [];
        const neuralColors = [
            '79, 70, 229',   // Indigo 600
            '37, 99, 235',   // Blue 600
            '6, 182, 212',   // Cyan 500
            '16, 185, 129',  // Emerald 500
            '147, 51, 234',  // Purple 600
            '244, 63, 94'    // Rose 500
        ];
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.45,
                vy: (Math.random() - 0.5) * 0.45,
                radius: Math.random() * 2.2 + 1.2,
                opacity: Math.random() * 0.45 + 0.35,
                color: neuralColors[Math.floor(Math.random() * neuralColors.length)]
            });
        }
    }
    
    createOrbs() {
        this.orbs = [];
        for (let i = 0; i < this.orbCount; i++) {
            this.orbs.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.25,
                vy: (Math.random() - 0.5) * 0.25,
                radius: Math.random() * 120 + 60,
                hue: Math.random() * 50 + 200, // Sky blue to indigo
                opacity: Math.random() * 0.05 + 0.02
            });
        }
    }
    
    drawParticles() {
        this.particles.forEach(particle => {
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(${particle.color}, ${particle.opacity})`;
            this.ctx.fill();
            
            // Soft glow
            this.ctx.shadowBlur = 6;
            this.ctx.shadowColor = `rgba(${particle.color}, 0.35)`;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        });
    }
    
    drawConnections() {
        // Inter-particle synapses
        this.particles.forEach((p1, i) => {
            this.particles.slice(i + 1).forEach(p2 => {
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 140) {
                    const opacity = (1 - distance / 140) * 0.22;
                    this.ctx.beginPath();
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.strokeStyle = `rgba(79, 70, 229, ${opacity})`;
                    this.ctx.lineWidth = 0.85;
                    this.ctx.stroke();
                }
            });
        });

        // Mouse laser synapse attractor with smooth fluid inertia
        if (this.mouse.smoothX !== null && this.mouse.smoothY !== null) {
            this.particles.forEach(p => {
                const dx = this.mouse.smoothX - p.x;
                const dy = this.mouse.smoothY - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 165) {
                    const opacity = (1 - dist / 165) * 0.62;
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.mouse.smoothX, this.mouse.smoothY);
                    this.ctx.lineTo(p.x, p.y);
                    this.ctx.strokeStyle = `rgba(0, 240, 255, ${opacity})`;
                    this.ctx.lineWidth = 1.25;
                    this.ctx.stroke();

                    // Spark highlight at particle node
                    this.ctx.beginPath();
                    this.ctx.arc(p.x, p.y, p.radius + 1.8, 0, Math.PI * 2);
                    this.ctx.fillStyle = `rgba(0, 240, 255, ${opacity * 0.85})`;
                    this.ctx.fill();
                }
            });
        }
    }

    drawSparks() {
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.x += s.vx;
            s.y += s.vy;
            s.life -= s.decay;

            if (s.life <= 0) {
                this.sparks.splice(i, 1);
                continue;
            }

            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.radius * s.life, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(${s.color}, ${s.life * 0.75})`;
            this.ctx.shadowBlur = 6;
            this.ctx.shadowColor = `rgba(${s.color}, ${s.life * 0.6})`;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }
    }
    
    drawOrbs() {
        this.orbs.forEach(orb => {
            const gradient = this.ctx.createRadialGradient(
                orb.x, orb.y, 0,
                orb.x, orb.y, orb.radius
            );
            
            gradient.addColorStop(0, `hsla(${orb.hue}, 100%, 50%, ${orb.opacity})`);
            gradient.addColorStop(0.5, `hsla(${orb.hue}, 100%, 50%, ${orb.opacity * 0.5})`);
            gradient.addColorStop(1, `hsla(${orb.hue}, 100%, 50%, 0)`);
            
            this.ctx.beginPath();
            this.ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = gradient;
            this.ctx.fill();
        });
    }
    
    updateParticles() {
        this.particles.forEach(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;

            // Gravitational pull toward smooth mouse cursor position
            if (this.mouse.smoothX !== null && this.mouse.smoothY !== null) {
                const dx = this.mouse.smoothX - particle.x;
                const dy = this.mouse.smoothY - particle.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < this.mouse.radius && dist > 8) {
                    const force = (1 - dist / this.mouse.radius) * 0.38;
                    particle.x += (dx / dist) * force;
                    particle.y += (dy / dist) * force;
                }
            }
            
            // Bounce off edges
            if (particle.x < 0 || particle.x > this.canvas.width) particle.vx *= -1;
            if (particle.y < 0 || particle.y > this.canvas.height) particle.vy *= -1;
            
            // Keep within bounds
            particle.x = Math.max(0, Math.min(this.canvas.width, particle.x));
            particle.y = Math.max(0, Math.min(this.canvas.height, particle.y));
        });
    }
    
    updateOrbs() {
        this.orbs.forEach(orb => {
            orb.x += orb.vx;
            orb.y += orb.vy;
            
            // Bounce off edges
            if (orb.x < -orb.radius || orb.x > this.canvas.width + orb.radius) orb.vx *= -1;
            if (orb.y < -orb.radius || orb.y > this.canvas.height + orb.radius) orb.vy *= -1;
        });
    }
    
    animate() {
        // Fluid spring lerp toward real cursor coordinates
        if (this.mouse.x !== null && this.mouse.y !== null) {
            if (this.mouse.smoothX === null) {
                this.mouse.smoothX = this.mouse.x;
                this.mouse.smoothY = this.mouse.y;
            } else {
                this.mouse.smoothX += (this.mouse.x - this.mouse.smoothX) * 0.16;
                this.mouse.smoothY += (this.mouse.y - this.mouse.smoothY) * 0.16;
            }
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.drawOrbs();
        this.drawConnections();
        this.drawParticles();
        this.drawSparks();
        
        this.updateParticles();
        this.updateOrbs();
        
        requestAnimationFrame(() => this.animate());
    }
}

// ============================================
// NAVBAR FUNCTIONALITY
// ============================================
class Navbar {
    constructor() {
        this.navbar = document.getElementById('navbar');
        this.mobileMenuToggle = document.getElementById('mobileMenuToggle');
        this.mobileMenu = document.getElementById('mobileMenu');
        this.loginBtn = document.getElementById('enterVibeBtn') || document.getElementById('loginBtn');
        this.loginDropdown = document.getElementById('loginDropdown');
        
        this.init();
    }
    
    init() {
        this.handleScroll();
        this.setupMobileMenu();
        this.setupSmoothScroll();
        this.setupDropdown();
        this.setupScrollspy();
        this.setupScrollIndicator();
        
        window.addEventListener('scroll', () => this.handleScroll());
    }
    
    handleScroll() {
        if (window.scrollY > 100) {
            this.navbar.classList.add('scrolled');
        } else {
            this.navbar.classList.remove('scrolled');
        }
    }
    
    setupMobileMenu() {
        if (!this.mobileMenuToggle || !this.mobileMenu) return;
        this.mobileMenuToggle.addEventListener('click', () => {
            this.mobileMenu.classList.toggle('active');
            this.mobileMenuToggle.classList.toggle('active');
            document.body.classList.toggle('no-scroll');
        });
        
        // Close mobile menu when clicking on a link
        const mobileLinks = document.querySelectorAll('.mobile-nav-link');
        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                this.mobileMenu.classList.remove('active');
                this.mobileMenuToggle.classList.remove('active');
                document.body.classList.remove('no-scroll');
            });
        });
    }
    
    setupSmoothScroll() {
        const links = document.querySelectorAll('a[href^="#"]');
        links.forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (href === '#' || href === '') return;
                
                e.preventDefault();
                const target = document.querySelector(href);
                
                if (target) {
                    const offset = 80;
                    const targetPosition = target.offsetTop - offset;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }
    
    setupDropdown() {
        // Dropdown toggle on touch or click
        if (this.loginBtn && this.loginDropdown) {
            this.loginBtn.addEventListener('click', (e) => {
                // If clicked on arrow or on mobile
                if (window.innerWidth <= 768 || e.target.classList.contains('btn-arrow')) {
                    e.preventDefault();
                    this.loginDropdown.classList.toggle('show');
                }
            });
            document.addEventListener('click', (e) => {
                if (!this.loginBtn.contains(e.target) && !this.loginDropdown.contains(e.target)) {
                    this.loginDropdown.classList.remove('show');
                }
            });
        }
    }

    setupScrollspy() {
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.nav-link');
        if (!sections.length || !navLinks.length) return;

        window.addEventListener('scroll', throttle(() => {
            let current = 'hero';
            const scrollY = window.pageYOffset;

            sections.forEach(section => {
                const sectionTop = section.offsetTop - 140;
                const sectionHeight = section.offsetHeight;
                if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
                    current = section.getAttribute('id');
                }
            });

            if (scrollY < 120) {
                current = 'hero';
            }

            navLinks.forEach(link => {
                link.classList.remove('active');
                const dot = link.querySelector('.nav-dot');
                if (dot) dot.remove();

                if (link.getAttribute('href') === `#${current}`) {
                    link.classList.add('active');
                    const newDot = document.createElement('span');
                    newDot.className = 'nav-dot';
                    link.appendChild(newDot);
                }
            });
        }, 100));
    }

    setupScrollIndicator() {
        const indicator = document.querySelector('.hero-scroll-indicator');
        if (indicator) {
            indicator.style.cursor = 'pointer';
            indicator.addEventListener('click', () => {
                const target = document.getElementById('highlights');
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }
    }
}

// ============================================
// RULES ACCORDION
// ============================================
class RulesAccordion {
    constructor() {
        this.ruleItems = document.querySelectorAll('.rule-item');
        this.init();
    }
    
    init() {
        this.ruleItems.forEach(item => {
            const header = item.querySelector('.rule-header');
            if (header) {
                header.addEventListener('click', () => this.toggle(item));
            }
        });
    }
    
    toggle(item) {
        const isActive = item.classList.contains('active');
        
        // Close all items
        this.ruleItems.forEach(i => i.classList.remove('active'));
        
        // Open clicked item if it wasn't active
        if (!isActive) {
            item.classList.add('active');
        }
    }
}

// ============================================
// FAQS ACCORDION
// ============================================
class FaqsAccordion {
    constructor() {
        this.faqItems = document.querySelectorAll('.faq-item');
        this.init();
    }
    
    init() {
        this.faqItems.forEach(item => {
            const header = item.querySelector('.faq-header');
            if (header) {
                header.addEventListener('click', () => this.toggle(item));
            }
        });
    }
    
    toggle(item) {
        const isActive = item.classList.contains('active');
        this.faqItems.forEach(i => i.classList.remove('active'));
        if (!isActive) {
            item.classList.add('active');
        }
    }
}

// ============================================
// SCROLL ANIMATIONS (AOS - Animate on Scroll)
// ============================================
class ScrollAnimations {
    constructor() {
        this.elements = document.querySelectorAll('[data-aos]');
        this.init();
    }
    
    init() {
        this.observe();
        window.addEventListener('scroll', () => this.checkElements());
        // Initial check
        this.checkElements();
    }
    
    observe() {
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('aos-animate');
                    }
                });
            }, {
                threshold: 0.1,
                rootMargin: '0px 0px -50px 0px'
            });
            
            this.elements.forEach(element => observer.observe(element));
        } else {
            // Fallback for browsers without IntersectionObserver
            this.checkElements();
        }
    }
    
    checkElements() {
        this.elements.forEach(element => {
            const rect = element.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            
            if (rect.top < windowHeight - 100) {
                element.classList.add('aos-animate');
            }
        });
    }
}

// ============================================
// BACK TO TOP BUTTON
// ============================================
class BackToTop {
    constructor() {
        this.button = document.getElementById('backToTop');
        this.init();
    }
    
    init() {
        this.button.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
}

// ============================================
// HERO TEXT ANIMATION
// ============================================
class HeroAnimation {
    constructor() {
        this.heroTitle = document.querySelector('.hero-title');
        this.init();
    }
    
    init() {
        if (this.heroTitle) {
            this.heroTitle.classList.add('hero-animated');
        }
    }
}

// ============================================
// FLUID AI MAGNETIC CURSOR
// ============================================
class CustomCursor {
    constructor() {
        this.dot = document.getElementById('cursorDot');
        this.ring = document.getElementById('cursorRing');
        if (!this.dot || !this.ring || window.innerWidth <= 768) return;
        
        this.mousePos = { x: -100, y: -100 };
        this.ringPos = { x: -100, y: -100 };
        this.dotPos = { x: -100, y: -100 };
        this.init();
    }
    
    init() {
        window.addEventListener('mousemove', (e) => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
            this.dot.classList.remove('custom-cursor-hidden');
            this.ring.classList.remove('custom-cursor-hidden');
        });
        
        window.addEventListener('mouseleave', () => {
            this.dot.classList.add('custom-cursor-hidden');
            this.ring.classList.add('custom-cursor-hidden');
        });
        
        window.addEventListener('mousedown', () => {
            this.ring.classList.add('clicking');
        });
        
        window.addEventListener('mouseup', () => {
            this.ring.classList.remove('clicking');
        });
        
        // Interactive magnetic expansion on all interactive cards & buttons
        const hoverables = document.querySelectorAll(
            'a, button, .btn, .chip-item, .bento-card, .sat-badge, .hero-floating-card, .rule-item, .faq-item, .highlight-card, .hero-scroll-indicator, .rule-header, .faq-header'
        );
        hoverables.forEach(el => {
            el.addEventListener('mouseenter', () => {
                this.ring.classList.add('active-hover');
            });
            el.addEventListener('mouseleave', () => {
                this.ring.classList.remove('active-hover');
            });
        });
        
        const render = () => {
            // High-speed spring follow for dot
            this.dotPos.x += (this.mousePos.x - this.dotPos.x) * 0.45;
            this.dotPos.y += (this.mousePos.y - this.dotPos.y) * 0.45;
            
            // Silky smooth lag for magnetic ring
            this.ringPos.x += (this.mousePos.x - this.ringPos.x) * 0.16;
            this.ringPos.y += (this.mousePos.y - this.ringPos.y) * 0.16;
            
            this.dot.style.left = `${this.dotPos.x}px`;
            this.dot.style.top = `${this.dotPos.y}px`;
            
            this.ring.style.left = `${this.ringPos.x}px`;
            this.ring.style.top = `${this.ringPos.y}px`;
            
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }
}

// ============================================
// HERO 3D PERSPECTIVE PARALLAX TILT
// ============================================
class HeroParallax {
    constructor() {
        this.hero = document.querySelector('.hero');
        this.isoWrapper = document.querySelector('.hero-iso-wrapper');
        this.cardAi = document.querySelector('.card-ai-engine');
        this.cardStatus = document.querySelector('.card-event-status');
        this.satBadges = document.querySelectorAll('.sat-badge');
        
        if (!this.hero || !this.isoWrapper || window.innerWidth < 1100) return;
        this.init();
    }
    
    init() {
        let mouseX = 0, mouseY = 0;
        let targetX = 0, targetY = 0;
        
        window.addEventListener('mousemove', (e) => {
            const rect = this.hero.getBoundingClientRect();
            if (e.clientY < rect.top - 100 || e.clientY > rect.bottom + 150) return;
            
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            targetX = (e.clientX - centerX) / (rect.width / 2);
            targetY = (e.clientY - centerY) / (rect.height / 2);
        });
        
        const update = () => {
            mouseX += (targetX - mouseX) * 0.08;
            mouseY += (targetY - mouseY) * 0.08;
            
            // Subtle 3D perspective rotation on the isometric pedestal
            this.isoWrapper.style.transform = `perspective(1000px) rotateY(${mouseX * 7}deg) rotateX(${-mouseY * 7}deg)`;
            
            if (this.cardAi) {
                this.cardAi.style.transform = `translate3d(${-mouseX * 14}px, ${-mouseY * 10}px, 20px)`;
            }
            if (this.cardStatus) {
                this.cardStatus.style.transform = `translate3d(${mouseX * 15}px, ${mouseY * 12}px, 20px)`;
            }
            
            this.satBadges.forEach((badge, idx) => {
                const depth = (idx + 1) * 6;
                badge.style.transform = `translate3d(${mouseX * depth}px, ${mouseY * depth}px, 15px)`;
            });
            
            requestAnimationFrame(update);
        };
        requestAnimationFrame(update);
    }
}

// ============================================
// AI ENGINE CHECKLIST PROGRESSIVE PULSE
// ============================================
class EngineChecklistPulse {
    constructor() {
        this.items = document.querySelectorAll('.engine-checklist .check-item');
        if (!this.items.length) return;
        this.currentIndex = 0;
        this.start();
    }
    
    start() {
        setInterval(() => {
            this.items.forEach((item, i) => {
                if (i === this.currentIndex) {
                    item.classList.add('pulse-active');
                } else {
                    item.classList.remove('pulse-active');
                }
            });
            this.currentIndex = (this.currentIndex + 1) % this.items.length;
        }, 2200);
    }
}

// ============================================
// BUTTON CLICK EFFECTS
// ============================================
class ButtonEffects {
    constructor() {
        this.buttons = document.querySelectorAll('.btn, .lr-card button, .coordinator-contact');
        this.init();
    }
    
    init() {
        this.buttons.forEach(button => {
            button.addEventListener('click', (e) => this.createRipple(e, button));
        });
    }
    
    createRipple(e, button) {
        const rect = button.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const ripple = document.createElement('span');
        ripple.style.position = 'absolute';
        ripple.style.width = '20px';
        ripple.style.height = '20px';
        ripple.style.background = 'rgba(255, 255, 255, 0.5)';
        ripple.style.borderRadius = '50%';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.style.transform = 'translate(-50%, -50%) scale(0)';
        ripple.style.animation = 'ripple 0.6s ease-out';
        ripple.style.pointerEvents = 'none';
        
        button.style.position = 'relative';
        button.style.overflow = 'hidden';
        button.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    }
}

// Add ripple animation to CSS dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple {
        to {
            transform: translate(-50%, -50%) scale(20);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ============================================
// PRELOADER (Optional)
// ============================================
class Preloader {
    constructor() {
        this.init();
    }
    
    init() {
        window.addEventListener('load', () => {
            document.body.classList.add('loaded');
            // Start animations after page load
            setTimeout(() => {
                document.body.style.overflow = 'auto';
            }, 500);
        });
    }
}

// ============================================
// PERFORMANCE OPTIMIZATION
// ============================================
class PerformanceOptimizer {
    constructor() {
        this.init();
    }
    
    init() {
        // Reduce animations on low-end devices
        if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
            document.body.classList.add('reduced-motion');
        }
        
        // Lazy load images if any
        if ('IntersectionObserver' in window) {
            const images = document.querySelectorAll('img[data-src]');
            const imageObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        imageObserver.unobserve(img);
                    }
                });
            });
            
            images.forEach(img => imageObserver.observe(img));
        }
    }
}

// ============================================
// TIMELINE INTERACTION
// ============================================
class TimelineInteraction {
    constructor() {
        this.timelineItems = document.querySelectorAll('.timeline-item');
        this.init();
    }
    
    init() {
        this.timelineItems.forEach((item) => {
            const marker = item.querySelector('.timeline-marker');
            if (!marker) return;

            item.addEventListener('mouseenter', () => {
                marker.classList.add('is-active');
            });
            
            item.addEventListener('mouseleave', () => {
                marker.classList.remove('is-active');
            });
        });
    }
}

// ============================================
// HIGHLIGHT CARDS ANIMATION
// ============================================
class HighlightCardsAnimation {
    constructor() {
        this.cards = document.querySelectorAll('.highlight-card');
        this.init();
    }
    
    init() {
        this.cards.forEach((card, index) => {
            card.addEventListener('mouseenter', () => {
                card.style.transform = `translateY(-15px) rotate(${Math.random() * 4 - 2}deg)`;
            });
            
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0) rotate(0)';
            });
        });
    }
}

// ============================================
// PARTICLE CLICK EFFECT
// ============================================
class ParticleClickEffect {
    constructor() {
        this.init();
    }
    
    init() {
        document.addEventListener('click', (e) => {
            this.createParticles(e.clientX, e.clientY);
        });
    }
    
    createParticles(x, y) {
        const particleCount = 8;
        const colors = ['#8b5cf6', '#6366f1', '#06b6d4', '#10b981'];
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            const angle = (Math.PI * 2 * i) / particleCount;
            const velocity = 2;
            
            particle.style.position = 'fixed';
            particle.style.width = '4px';
            particle.style.height = '4px';
            particle.style.background = colors[Math.floor(Math.random() * colors.length)];
            particle.style.borderRadius = '50%';
            particle.style.pointerEvents = 'none';
            particle.style.left = x + 'px';
            particle.style.top = y + 'px';
            particle.style.zIndex = '9999';
            
            document.body.appendChild(particle);
            
            let posX = x;
            let posY = y;
            let opacity = 1;
            
            const animate = () => {
                posX += Math.cos(angle) * velocity;
                posY += Math.sin(angle) * velocity;
                opacity -= 0.02;
                
                particle.style.left = posX + 'px';
                particle.style.top = posY + 'px';
                particle.style.opacity = opacity;
                
                if (opacity > 0) {
                    requestAnimationFrame(animate);
                } else {
                    particle.remove();
                }
            };
            
            animate();
        }
    }
}

// ============================================
// KEYBOARD NAVIGATION
// ============================================
class KeyboardNavigation {
    constructor() {
        this.sections = ['hero', 'highlights', 'timeline', 'rules', 'login-register', 'coordinators'];
        this.currentSection = 0;
        this.init();
    }
    
    init() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'PageDown') {
                e.preventDefault();
                this.navigateToSection(1);
            } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
                e.preventDefault();
                this.navigateToSection(-1);
            } else if (e.key === 'Home') {
                e.preventDefault();
                this.scrollToTop();
            } else if (e.key === 'End') {
                e.preventDefault();
                this.scrollToBottom();
            }
        });
    }
    
    navigateToSection(direction) {
        this.currentSection += direction;
        this.currentSection = Math.max(0, Math.min(this.sections.length - 1, this.currentSection));
        
        const section = document.getElementById(this.sections[this.currentSection]);
        if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    
    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.currentSection = 0;
    }
    
    scrollToBottom() {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        this.currentSection = this.sections.length - 1;
    }
}

// ============================================
// HUD 3D TILT EFFECT
// ============================================
class TerminalTiltEffect {
    constructor() {
        this.card = document.querySelector('.hud-window') || document.querySelector('.hero-terminal-card');
        this.init();
    }
    
    init() {
        if (!this.card || window.innerWidth <= 768) return;
        
        this.card.addEventListener('mousemove', (e) => {
            const rect = this.card.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            const rotateX = -(y / rect.height) * 8;
            const rotateY = (x / rect.width) * 8;
            this.card.style.transform = `perspective(1200px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
        });
        
        this.card.addEventListener('mouseleave', () => {
            this.card.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg) translateY(0px)';
        });
    }
}

// ============================================
// DYNAMIC SPOTLIGHT MANAGER (MOUSE TRACKING GLOW)
// ============================================
class SpotlightManager {
    constructor() {
        this.elements = document.querySelectorAll(
            '[data-spotlight], .highlight-card, .rule-item, .lr-card, .timeline-content, .hud-window'
        );
        this.init();
    }
    
    init() {
        if (!this.elements.length || window.innerWidth <= 768) return;
        
        this.elements.forEach(el => {
            el.addEventListener('mousemove', (e) => {
                const rect = el.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                el.style.setProperty('--mouse-x', `${x}px`);
                el.style.setProperty('--mouse-y', `${y}px`);
            });
        });
    }
}

// ============================================
// LIVE HUD UTC MICROSECOND CLOCK
// ============================================
class LiveHudClock {
    constructor() {
        this.clockEl = document.getElementById('hudLiveClock');
        if (this.clockEl) {
            this.start();
        }
    }
    
    start() {
        const update = () => {
            if (!this.clockEl) return;
            const now = new Date();
            const h = String(now.getUTCHours()).padStart(2, '0');
            const m = String(now.getUTCMinutes()).padStart(2, '0');
            const s = String(now.getUTCSeconds()).padStart(2, '0');
            const ms = String(now.getUTCMilliseconds()).padStart(3, '0');
            this.clockEl.textContent = `${h}:${m}:${s}.${ms} UTC`;
            requestAnimationFrame(update);
        };
        requestAnimationFrame(update);
    }
}

// ============================================
// HUD LIVE TELEMETRY STREAM (AI PIPELINE FEED)
// ============================================
class HudTelemetryStream {
    constructor() {
        this.console = document.getElementById('hudTelemetryConsole');
        this.events = [
            { tag: 'tag-ingest', tagText: '[PROMPT_INGEST]', team: 'TEAM #112', msg: 'logged iteration prompt (512 tokens) → model: <span class="c-hl">gpt-4o</span>' },
            { tag: 'tag-stamp', tagText: '[TIMESTAMP]', team: '', msg: 'Immutable SHA-256 block locked into ledger' },
            { tag: 'tag-verify', tagText: '[DUAL_VERIFY]', team: 'TEAM #105', msg: 'Verified GitHub repo commit + Vercel edge deployment <span class="c-success">HTTP 200 OK</span>' },
            { tag: 'tag-eval', tagText: '[GEMINI_EVAL]', team: 'TEAM #112', msg: 'Gemini 2.5 Flash assigned prompt architecture score: <span class="c-score">9.8/10</span>' },
            { tag: 'tag-ingest', tagText: '[PROMPT_INGEST]', team: 'TEAM #119', msg: 'streamed refactor prompt (640 tokens) → model: <span class="c-hl">claude-3-7-sonnet</span>' },
            { tag: 'tag-stamp', tagText: '[TIMESTAMP]', team: '', msg: 'Cryptographic block verified against tamper-proof hash chain' },
            { tag: 'tag-verify', tagText: '[DUAL_VERIFY]', team: 'TEAM #119', msg: 'GitHub tree snapshot cloned & live health-check validated <span class="c-success">HTTP 200 OK</span>' },
            { tag: 'tag-eval', tagText: '[GEMINI_EVAL]', team: 'TEAM #105', msg: 'Gemini autonomous evaluation matrix complete → Total: <span class="c-score">48/50</span>' }
        ];
        this.eventIndex = 0;
        if (this.console) {
            this.start();
        }
    }
    
    start() {
        setInterval(() => {
            this.pushEvent();
        }, 3200);
    }
    
    pushEvent() {
        if (!this.console) return;
        const ev = this.events[this.eventIndex % this.events.length];
        this.eventIndex++;
        
        const now = new Date();
        const h = String(now.getUTCHours()).padStart(2, '0');
        const m = String(now.getUTCMinutes()).padStart(2, '0');
        const s = String(now.getUTCSeconds()).padStart(2, '0');
        const ms = String(now.getUTCMilliseconds()).padStart(3, '0');
        const timeStr = `[${h}:${m}:${s}.${ms}]`;
        
        const line = document.createElement('div');
        line.className = 'console-line';
        
        line.innerHTML = `
            <span class="c-time">${timeStr}</span>
            <span class="c-tag ${ev.tag}">${ev.tagText}</span>
            ${ev.team ? `<span class="c-team">${ev.team}</span>` : ''}
            <span class="c-msg">${ev.msg}</span>
        `;
        
        this.console.appendChild(line);
        if (this.console.children.length > 5) {
            this.console.removeChild(this.console.children[0]);
        }
    }
}

// ============================================
// INITIALIZE ALL FEATURES
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Core functionality
    new CyberBackground();
    new Navbar();
    new RulesAccordion();
    new FaqsAccordion();
    new ScrollAnimations();
    new BackToTop();
    
    // Enhanced effects
    new HeroAnimation();
    new ButtonEffects();
    new TimelineInteraction();
    new HighlightCardsAnimation();
    new TerminalTiltEffect();
    new SpotlightManager();
    new LiveHudClock();
    new HudTelemetryStream();
    
    // Advanced cursor & interactive 3D perspective
    if (window.innerWidth > 768) {
        new CustomCursor();
        new HeroParallax();
        new ParticleClickEffect();
    }
    new EngineChecklistPulse();
    
    // Utilities
    new Preloader();
    new PerformanceOptimizer();
    new KeyboardNavigation();
    
    console.log('🚀 VIBEATHON 2026 [AI 2.0] - Platform Core Loaded Successfully!');
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Debounce function for performance
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function for scroll events
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Check if element is in viewport
function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// Random number generator
function random(min, max) {
    return Math.random() * (max - min) + min;
}

// ============================================
// EXPORT FOR TESTING (if needed)
// ============================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CyberBackground,
        Navbar,
        RulesAccordion,
        ScrollAnimations,
        BackToTop
    };
}
document.querySelectorAll('.admin-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'admin-login.html';
  });
});
// ================================
// UNIVERSAL DATA-REDIRECT HANDLER
// ================================
document.querySelectorAll('[data-redirect]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();

    const target = el.getAttribute('data-redirect');
    if (!target) return;

    window.location.href = target;
  });
});

// Stealth shortcut to Super Management Console (Ctrl + Shift + M)
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
    e.preventDefault();
    window.location.href = 'manage-login.html';
  }
});

// Stealth shortcut: double-clicking shield logo on navbar
const brandLogoShield = document.querySelector('.brand-shield-wrapper');
if (brandLogoShield) {
  brandLogoShield.style.cursor = 'pointer';
  brandLogoShield.addEventListener('dblclick', () => {
    window.location.href = 'manage-login.html';
  });
}

