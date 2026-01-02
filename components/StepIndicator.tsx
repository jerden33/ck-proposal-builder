'use client'

interface Step {
  number: number
  name: string
}

interface StepIndicatorProps {
  steps: Step[]
  currentStep: number
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-3 mb-12 fade-in">
      {steps.map((step, index) => (
        <div key={step.number} className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            <div className={`step-number ${
              currentStep === step.number ? 'active' :
              currentStep > step.number ? 'completed' : 'inactive'
            }`}>
              {currentStep > step.number ? '✓' : step.number}
            </div>
            <span className={`font-semibold text-sm sm:text-base transition-colors duration-300 ${
              currentStep >= step.number ? 'text-off-black' : 'text-gray-400'
            }`}>
              {step.name}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className={`step-divider ${currentStep > step.number ? 'completed' : ''}`} />
          )}
        </div>
      ))}
    </div>
  )
}
