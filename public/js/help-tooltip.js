$(document).ready(function () {
    // Initialize tooltips for any elements with data-toggle="tooltip" or .help-tooltip
    if ($.fn.tooltip) {
        $('[data-toggle="tooltip"]').tooltip({
            trigger: 'hover focus'
        });
    }

    // Initialize popovers for any elements with data-toggle="popover"
    if ($.fn.popover) {
        $('[data-toggle="popover"]').popover({
            trigger: 'click hover',
            placement: 'auto'
        });
    }
});
