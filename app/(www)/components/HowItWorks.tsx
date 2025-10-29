"use client";
import { Upload, Sparkles, MessageSquare, DollarSign } from "lucide-react";
import { motion } from "motion/react";

const steps = [
  { 
    icon: Upload, 
    title: "Import Your Leads", 
    description: "Connect your CRM or upload dormant leads in seconds.", 
    step: "01" 
  },
  { 
    icon: Sparkles, 
    title: "AI Analysis", 
    description: "Behavior + timing models tailor your strategy.", 
    step: "02" 
  },
  { 
    icon: MessageSquare, 
    title: "Automated Outreach", 
    description: "Personalized sequences reach out at perfect moments.", 
    step: "03" 
  },
  { 
    icon: DollarSign, 
    title: "Convert & Close", 
    description: "Turn dead leads into active opportunities.", 
    step: "04" 
  },
];

export default function HowItWorks() {
  return (
    <section className="relative py-20 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div 
          className="text-center mb-16" 
          initial={{ opacity: 0, y: 30 }} 
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} 
          transition={{ duration: 0.6 }}>
          <h2 className="text-4xl sm:text-5xl text-white mb-4">How It Works</h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Get started in minutes and start reviving leads today
          </p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <motion.div 
              key={step.title} 
              className="relative flex flex-col items-center text-center"
              initial={{ opacity: 0, y: 30 }} 
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} 
              transition={{ duration: 0.5, delay: i * 0.15 }}>
              
              {/* Connecting line */}
              {i < steps.length - 1 && (
                <motion.div 
                  className="hidden lg:block absolute top-16 left-[60%] w-full h-0.5 bg-gradient-to-r from-amber-500 to-orange-400"
                  initial={{ scaleX: 0 }} 
                  whileInView={{ scaleX: 1 }} 
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: i * 0.15 + 0.3 }} 
                  style={{ transformOrigin: "left" }}
                />
              )}
              
              {/* Icon circle */}
              <motion.div 
                className="relative z-10 w-24 h-24 rounded-full bg-gradient-to-br from-[#4F46E5] to-indigo-700 flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/50"
                whileHover={{ scale: 1.1, rotate: 360 }} 
                transition={{ duration: 0.6 }}>
                <step.icon className="h-12 w-12 text-white" />
              </motion.div>
              
              {/* Step number */}
              <motion.div 
                className="absolute top-4 right-8 text-6xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 bg-clip-text text-transparent"
                initial={{ opacity: 0 }} 
                whileInView={{ opacity: 1 }} 
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.15 + 0.2 }}>
                {step.step}
              </motion.div>
              
              <h3 className="text-xl text-white mb-3">{step.title}</h3>
              <p className="text-gray-300">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}