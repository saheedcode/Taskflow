const SIZE_CLASSES = {
  xs: "h-8 w-8 text-[12px]",
  sm: "h-9 w-9 text-[13.5px]",
  md: "h-10 w-10 text-[14.5px]",
  lg: "h-[72px] w-[72px] text-[24px]",
};

/**
 * Shows the user's uploaded photo when there is one, and falls back to
 * their initials on the accent background otherwise. Single source of
 * truth for "what does this person's avatar look like" across the app.
 */
export default function AvatarCircle({ avatarUrl, initials, size = "sm", className = "" }) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.sm;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`shrink-0 rounded-full object-cover ${sizeClass} ${className}`}
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-white ${sizeClass} ${className}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
