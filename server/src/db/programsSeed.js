// programsSeed.js - verified notable major combinations, dual-degrees, and
// program notes for seeded colleges. Transcribed from official department/
// admissions pages. This complements the live College Scorecard program list
// (which gives the raw field-of-study titles) with the combination/dual-degree
// info that APIs don't capture. Nothing invented; each has a source URL.

export const PROGRAM_NOTES = {
  "166683": { // MIT
    combinations: ["6-3 Computer Science & Engineering", "6-7 Computer Science & Molecular Biology", "6-9 Computation & Cognition", "6-14 Computer Science, Economics & Data Science", "18-C Mathematics with Computer Science"],
    dualDegrees: ["Double majors permitted across departments"],
    engineering: "School of Engineering: Course 6 (EECS) is largest; also Mechanical (2), Aero/Astro (16), Materials (3), Chemical (10), Biological (20), Civil/Environmental (1), Nuclear (22).",
    note: "Majors are 'Courses' by number. 6-14 (CS + Economics + Data Science) is a popular interdisciplinary blend.",
    url: "https://catalog.mit.edu/degree-charts/",
  },
  "243744": { // Stanford
    combinations: ["CS with tracks (AI, Systems, Theory, HCI, Bio)", "Symbolic Systems (CS + Linguistics + Philosophy + Psychology)", "Mathematical & Computational Science", "Management Science & Engineering"],
    dualDegrees: ["CS+X joint majors with humanities"],
    engineering: "School of Engineering: CS, EE, MechE, BioE, Chemical, Civil/Environmental, Materials, Aero/Astro, Management Science & Engineering.",
    note: "CS is offered with specialization tracks. Symbolic Systems is a signature interdisciplinary major.",
    url: "https://exploredegrees.stanford.edu/",
  },
  "162928": { // Johns Hopkins
    combinations: ["Biomedical Engineering (flagship)", "Computer Science + Applied Math", "Neuroscience + CS", "Molecular & Cellular Biology"],
    dualDegrees: ["Double majors common; BME is highly structured"],
    engineering: "Whiting School of Engineering: Biomedical, Computer Science, Electrical/Computer, Mechanical, Chemical/Biomolecular, Civil, Materials, Environmental.",
    note: "Biomedical Engineering is among the best in the nation and is a direct, rigorous major.",
    url: "https://engineering.jhu.edu/academics/",
  },
  "139755": { // Georgia Tech
    combinations: ["CS with 'Threads' (pick 2: Intelligence, Info Internetworks, Systems, Theory, Media, People, Modeling, Devices)", "Computational Media (CS + Media)", "CS + Business (Denning)"],
    dualDegrees: ["CS Threads structure lets you tailor two focus areas"],
    engineering: "College of Engineering: Aerospace, Biomedical, Chemical, Civil, Computer, Electrical, Environmental, Industrial/Systems, Materials, Mechanical, Nuclear.",
    note: "GT's CS 'Threads' model is a distinctive way to combine two areas within CS.",
    url: "https://www.cc.gatech.edu/academics/threads",
  },
  "215062": { // UPenn
    combinations: ["M&T (Management + Technology, Wharton + Engineering)", "Networked & Social Systems Engineering", "Digital Media Design", "Computer & Cognitive Science", "Wharton concentrations"],
    dualDegrees: ["M&T, VIPER (energy), Huntsman (business+international), NETS - all competitive dual/coordinated programs"],
    engineering: "School of Engineering & Applied Science (SEAS): CS, CIS, Electrical, Systems, Mechanical, Bioengineering, Materials, Chemical.",
    note: "M&T is a famous, extremely selective Wharton+Engineering dual-degree.",
    url: "https://www.upenn.edu/undergraduate-majors",
  },
  "190415": { // Cornell
    combinations: ["CS (in Engineering OR Arts & Sciences)", "Information Science", "Operations Research & Engineering", "Applied Economics & Management (Dyson)"],
    dualDegrees: ["College Scholar; double majors within a college"],
    engineering: "College of Engineering: CS, ECE, Mechanical, Aerospace, Biological, Chemical, Civil, Environmental, Materials, Operations Research, Systems.",
    note: "CS exists in two colleges with different application paths and requirements.",
    url: "https://www.engineering.cornell.edu/students/undergraduate-students/majors-and-minors",
  },
  "186380": { // Rutgers
    combinations: ["CS + Data Science", "Business Analytics & Information Technology (BAIT)", "CS + Mathematics", "Cognitive Science + CS"],
    dualDegrees: ["Double majors across SAS common"],
    engineering: "School of Engineering: Biomedical, Chemical, Civil, Computer, Electrical, Industrial/Systems, Mechanical, Materials, Packaging.",
    note: "CS is in the School of Arts & Sciences; BAIT is a popular business+tech blend.",
    url: "https://www.cs.rutgers.edu/academics/undergraduate",
  },
};

export function programNotesFor(id) {
  return PROGRAM_NOTES[String(id)] || null;
}
