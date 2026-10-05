// K22 — Categories index/shared category metadata

let activeCategory = "";
let editingCategoryItemId = null;

const CATEGORY_PAGE_META = {
  "Love": { icon:"heart", tone:"pink", description:"Relationships, memories, plans, and the people close to you." },
  "Medical": { icon:"stethoscope", tone:"lilac", description:"Appointments, providers, health records, documents, and personal medical notes." },
  "Goals": { icon:"target", tone:"gold", description:"Big plans, milestones, progress, and the things you are working toward." },
  "Routine": { icon:"sun", tone:"blue", description:"Daily rhythms, habits, routines, and the systems that keep life moving." },
  "Education": { icon:"graduation-cap", tone:"pink", description:"Learning plans, courses, research, school notes, and useful resources." },
  "Trackers": { icon:"chart-no-axes-column-increasing", tone:"lilac", description:"Anything you want to measure, notice, or keep a running record of." },
  "Cooking": { icon:"cooking-pot", tone:"pink", description:"Recipes, meal ideas, ingredients, favorites, and kitchen inspiration." },
  "My Food Order": { icon:"cup-soda", tone:"green", description:"Your favorite orders, customizations, restaurants, and things worth ordering again." },
  "Lifestyle Notes": { icon:"notebook-pen", tone:"gold", description:"Everyday references, preferences, ideas, and details that make life easier." },
  "Fashion": { icon:"shirt", tone:"pink", description:"Outfits, sizing, inspiration, shopping notes, and personal style." },
  "Parties": { icon:"party-popper", tone:"lilac", description:"Party ideas, guest plans, themes, supplies, and event inspiration." },
  "Wishlist": { icon:"shopping-bag", tone:"blue", description:"Things you want, things to compare, and ideas to come back to later." },
  "Business": { icon:"laptop", tone:"blue", description:"Projects, clients, deadlines, operations, documents, and business planning." },
  "Websites": { icon:"globe-2", tone:"lilac", description:"Websites, domains, renewals, project status, links, and related notes." },
  "Investments": { icon:"chart-no-axes-column-increasing", tone:"green", description:"Investment research, ideas, records, watchlists, and long-term notes." },
  "Networking": { icon:"users", tone:"gold", description:"People, introductions, follow-ups, opportunities, and useful connections." },
  "Legal": { icon:"file-text", tone:"pink", description:"Important legal notes, deadlines, references, and documents." },
  "Nellis Auction": { icon:"tags", tone:"blue", description:"Lots to watch, bid limits, auction links, pickups, and purchase records." },
  "Ideas": { icon:"lightbulb", tone:"pink", description:"A flexible space for thoughts, inspiration, possibilities, and things worth saving." },
  "Gifts": { icon:"gift", tone:"lilac", description:"Gift ideas, budgets, people, occasions, and what you have already bought." },
  "Wedding": { icon:"gem", tone:"green", description:"Plans, vendors, inspiration, budget notes, checklists, and wedding details." },
  "Kids": { icon:"baby", tone:"gold", description:"Ideas, plans, references, memories, and anything you want to keep for the future." },
  "Home": { icon:"house", tone:"pink", description:"Home ideas, projects, purchases, inspiration, maintenance, and plans." },
  "Car": { icon:"car-front", tone:"blue", description:"Maintenance, mileage, registration, insurance, repairs, receipts, and car notes." }
};

function categoryPageUrl(category) {
  return "category.html?name="+encodeURIComponent(category);
}


function bindCategoryCards() {
  document.querySelectorAll("[data-card]").forEach(card => {
    if (card.dataset.bound) return;
    card.dataset.bound="1";
    card.addEventListener("click",()=> {
      location.href=categoryPageUrl(card.dataset.card);
    });
  });
}
