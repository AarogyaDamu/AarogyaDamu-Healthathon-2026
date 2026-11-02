import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ConsultationPdfPayload {
  patientProfile: {
    fullName: string;
    diabetesType?: string;
    dateOfBirth?: string;
    diagnosisYear?: number;
    primaryClinician?: string;
    knownAllergies?: string;
    baselineNotes?: string;
  };
  concernsAndQuestions: string;
  personalNotes?: string;
  observations: Array<{
    numericValue: number;
    unit: string;
    context: string;
    observedAt: string;
    notes?: string;
  }>;
  medications: Array<{
    medicationName: string;
    dosageInstruction: string;
    frequency: string;
    timingDetails?: string;
    instructionSource: string;
  }>;
  tasks: Array<{
    title: string;
    category: string;
    dueAt: string;
    status: string;
  }>;
  documents: Array<{
    title: string;
    category: string;
    issuingFacility?: string;
    reportDate: string;
  }>;
}

export function exportConsultationSummaryPdf(payload: ConsultationPdfPayload): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const profile = payload.patientProfile || ({} as any);

  // Top Accent Bar (Solid brand teal, no gradient)
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageWidth, 5, 'F');

  // Header Title
  let cursorY = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('AarogyaDamu: Doctor Visit Report', 14, cursorY);

  cursorY += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(
    'A summary of your blood sugar records, medicines, and questions to share with your doctor.',
    14,
    cursorY
  );

  // Divider Line
  cursorY += 4;
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.line(14, cursorY, pageWidth - 14, cursorY);

  // Section 1: Patient Information
  cursorY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Patient Information', 14, cursorY);

  cursorY += 3;
  const conditionDisplay = (profile.diabetesType || 'TYPE_2_DIABETES')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  autoTable(doc, {
    startY: cursorY,
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 2,
      textColor: [51, 65, 85],
    },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [100, 116, 139], cellWidth: 34 },
      1: { cellWidth: 60, textColor: [15, 23, 42] },
      2: { fontStyle: 'bold', textColor: [100, 116, 139], cellWidth: 34 },
      3: { textColor: [15, 23, 42] },
    },
    body: [
      [
        'Patient Name:',
        profile.fullName || 'Ramesh Deshmukh',
        'Health Condition:',
        conditionDisplay,
      ],
      [
        'Doctor in Charge:',
        profile.primaryClinician || 'Dr. Anjali Kulkarni',
        'Year Diagnosed:',
        profile.diagnosisYear ? String(profile.diagnosisYear) : '2021',
      ],
      [
        'Known Allergies:',
        profile.knownAllergies || 'None reported',
        'Report Date:',
        new Date().toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
      ],
    ],
  });

  // Section 2: Questions for Doctor
  cursorY = (doc as any).lastAutoTable.finalY + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Questions & Things to Ask the Doctor', 14, cursorY);

  cursorY += 4;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240);
  
  const rawConcerns = payload.concernsAndQuestions || 'No specific questions added.';
  const wrappedConcerns = doc.splitTextToSize(rawConcerns, pageWidth - 36);
  const concernsBoxHeight = Math.max(16, wrappedConcerns.length * 4.5 + 6);

  doc.rect(14, cursorY, pageWidth - 28, concernsBoxHeight, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(wrappedConcerns, 18, cursorY + 6);

  cursorY += concernsBoxHeight + 6;

  // Section 3: Recent Blood Sugar Checks
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Recent Blood Sugar Checks (Last Readings)', 14, cursorY);

  const obsList = payload.observations || [];
  const obsRows = obsList.slice(0, 8).map((o) => {
    const rawCtx = (o.context || '').toUpperCase();
    let displayContext = 'Routine Check';
    if (rawCtx.includes('FASTING')) displayContext = 'Fasting (Morning Before Food)';
    else if (rawCtx.includes('POST') || rawCtx.includes('MEAL')) displayContext = '2 Hours After Meal';
    else if (rawCtx.includes('BEDTIME')) displayContext = 'Bedtime';

    const dateStr = o.observedAt
      ? new Date(o.observedAt).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : 'Recent';

    return [
      dateStr,
      `${o.numericValue} ${o.unit || 'mg/dL'}`,
      displayContext,
      o.notes || 'Normal routine check',
    ];
  });

  autoTable(doc, {
    startY: cursorY + 3,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 118, 110], // Brand teal
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
    },
    head: [['Date of Check', 'Sugar Level', 'When Checked', 'Personal Notes']],
    body: obsRows.length ? obsRows : [['No sugar readings recorded yet.', '-', '-', '-']],
  });

  // Section 4: Current Medicines
  cursorY = (doc as any).lastAutoTable.finalY + 7;
  if (cursorY > pageHeight - 50) {
    doc.addPage();
    cursorY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('4. Current Medicines & Dosages', 14, cursorY);

  const medList = payload.medications || [];
  const medRows = medList.map((m) => [
    m.medicationName || 'Medicine',
    m.dosageInstruction || 'As advised',
    m.frequency || 'Daily',
    m.instructionSource || 'Doctor prescription',
  ]);

  autoTable(doc, {
    startY: cursorY + 3,
    theme: 'grid',
    headStyles: {
      fillColor: [51, 65, 85], // Slate-700
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
    },
    head: [['Medicine Name', 'How to Take', 'How Often', 'Prescribed By']],
    body: medRows.length ? medRows : [['No active medicines listed.', '-', '-', '-']],
  });

  // Bottom Notice
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  const footerY = finalY > pageHeight - 20 ? pageHeight - 12 : finalY;

  doc.setDrawColor(226, 232, 240);
  doc.line(14, footerY - 3, pageWidth - 14, footerY - 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(
    'Notice: This paper is a helpful summary of your personal home logs. It does not replace medical advice from your doctor.',
    14,
    footerY
  );

  const todayStr = new Date().toISOString().split('T')[0];
  doc.save(`AarogyaDamu_Doctor_Report_${todayStr}.pdf`);
}